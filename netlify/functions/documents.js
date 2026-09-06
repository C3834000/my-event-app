// ============================================================================
// מאגר מסמכים — שלב ראשון (העלאה ידנית בלבד)
// ----------------------------------------------------------------------------
// אבטחה:
// - דורש כותרת x-docs-key שערכה שווה ל-env DOCS_API_KEY (סוד משותף).
//   בלי ההגדרה — הפונקציה מסרבת לעבוד (secure by default).
// - עובד עם SUPABASE_SERVICE_ROLE_KEY (נשאר בשרת בלבד; עוקף RLS).
//   הטבלאות החדשות עם RLS ללא policies — לא נגישות עם anon key.
// - קבצים נשמרים ב-bucket פרטי 'documents'; גישה רק דרך signed URLs.
//
// פעולות (POST JSON { action, ... }):
//   initUpload  { fileHash, fileName, fileMime, fileSize }
//               → בדיקת כפילות לפי hash; אם חדש: signed upload URL.
//   create      { data: {...מטא־דאטה}, source: {kind, ref} } → יצירת רשומה + מקור.
//   list        { direction?, reviewStatus?, monthKey? } → רשימה + מקורות + חשדות כפילות.
//   update      { id, data } → עדכון שדות מותרים בלבד.
//   archive     { id } → העברה לארכיון (ניתן לשחזור; הקובץ לא נמחק לעולם).
//   restore     { id } → שחזור מהארכיון.
//   fileUrl     { id } → signed URL לצפייה (שעה).
//   addSource   { id, kind, ref } → רישום מקור נוסף לאותו מסמך.
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'documents';

// שדות מותרים לעדכון/יצירה — הזנה ידנית; שדה ריק נשאר null (אין השלמה בניחוש)
const DOC_FIELDS = new Set([
  'direction', 'docType', 'counterparty', 'docNumber', 'docDate', 'currency',
  'netAmount', 'vatAmount', 'totalAmount', 'notes', 'reviewStatus',
  'relatedDocId', 'transactionId', 'giDocNumber',
  'filePath', 'fileHash', 'fileName', 'fileMime', 'fileSize',
]);

const toSnake = (obj) => Object.fromEntries(
  Object.entries(obj).map(([k, v]) => [
    k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()),
    v === '' || v === undefined ? null : v,
  ])
);
const toCamel = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj)
  ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]))
  : obj;

const pickDocFields = (data) => Object.fromEntries(
  Object.entries(data || {}).filter(([k]) => DOC_FIELDS.has(k))
);

const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// נתיב אחסון חייב להיות ASCII בלבד (Supabase Storage דוחה עברית במפתח האובייקט).
// השם המקורי (כולל עברית) נשמר בשדה file_name לתצוגה — רק הנתיב מנוקה.
const sanitizeFileName = (name) => {
  const raw = String(name || 'file');
  const dot = raw.lastIndexOf('.');
  const ext = dot > 0 ? raw.slice(dot).replace(/[^\w.]/g, '') : '';
  const base = (dot > 0 ? raw.slice(0, dot) : raw)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return (base || 'file') + ext;
};

/**
 * חשדות כפילות — סימון בלבד, אין מיזוג אוטומטי.
 * כפילות = אותו מספר מסמך + אותו *סוג* מסמך. חשבונית וקבלה עם אותו מספר
 * על אותה עסקה הן שני מסמכים לגיטימיים — לא כפילות.
 * אם סוג המסמך חסר בשני הצדדים, נדרש לפחות אותו ספק/לקוח כדי לסמן חשד.
 */
function isDuplicatePair(a, b) {
  if (!a.doc_number || a.doc_number !== b.doc_number) return false;
  if (a.doc_type && b.doc_type) return a.doc_type === b.doc_type;
  if (!a.doc_type && !b.doc_type) {
    return !!(a.counterparty && b.counterparty && a.counterparty === b.counterparty);
  }
  return false; // סוג ידוע מול סוג חסר — לא מסמנים
}

async function findSuspects(supabase, doc) {
  if (!doc.doc_number) return [];
  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_type, counterparty, doc_number, doc_date, total_amount')
    .eq('doc_number', doc.doc_number)
    .neq('id', doc.id);
  if (error || !data) return [];
  return data.filter(d => isDuplicatePair(doc, d)).map(toCamel);
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-docs-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

  // --- אימות: סוד משותף בכותרת ---
  const requiredKey = process.env.DOCS_API_KEY;
  if (!requiredKey) {
    return json(503, { success: false, error: 'DOCS_API_KEY לא מוגדר ב-Netlify — הפונקציה נעולה עד להגדרה' });
  }
  const providedKey = event.headers['x-docs-key'] || event.headers['X-Docs-Key'];
  if (providedKey !== requiredKey) {
    return json(401, { success: false, error: 'מפתח גישה שגוי או חסר (x-docs-key)' });
  }

  // --- חיבור Supabase עם מפתח service בלבד ---
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(503, { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY לא מוגדר — נדרש מפתח service בצד השרת' });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return json(400, { success: false, error: 'Invalid JSON body' });
  }
  const { action } = body;

  try {
    // ── initUpload: בדיקת כפילות לפי hash + הנפקת כתובת העלאה חתומה ──────
    if (action === 'initUpload') {
      const fileHash = String(body.fileHash || '').trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(fileHash)) {
        return json(400, { success: false, error: 'fileHash חייב להיות SHA-256 hex' });
      }
      const { data: existing, error: exErr } = await supabase
        .from('documents')
        .select('id, doc_type, counterparty, doc_number, doc_date, total_amount, file_name, review_status')
        .eq('file_hash', fileHash)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        return json(200, { success: true, duplicate: true, existing: toCamel(existing) });
      }
      const path = `${fileHash}/${sanitizeFileName(body.fileName)}`;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (signErr) throw signErr;
      return json(200, {
        success: true,
        duplicate: false,
        path,
        uploadUrl: signed.signedUrl,
        token: signed.token,
      });
    }

    // ── create: רשומת מסמך חדשה + מקור ───────────────────────────────────
    if (action === 'create') {
      const data = pickDocFields(body.data);
      if (!data.direction || !['income', 'expense'].includes(data.direction)) {
        return json(400, { success: false, error: 'direction חייב להיות income או expense' });
      }
      const id = newId('doc');
      const row = { id, ...toSnake(data) };
      const { data: inserted, error } = await supabase.from('documents').insert([row]).select().single();
      if (error) {
        // הפרת ייחודיות hash — כפילות שנאכפה בבסיס הנתונים
        if (String(error.code) === '23505') {
          return json(409, { success: false, duplicate: true, error: 'קובץ עם אותו hash כבר קיים במאגר' });
        }
        throw error;
      }
      const source = body.source || { kind: 'manual', ref: data.fileName || null };
      await supabase.from('document_sources').insert([{
        id: newId('src'),
        document_id: id,
        source_kind: source.kind || 'manual',
        source_ref: source.ref || null,
      }]);
      const suspects = await findSuspects(supabase, inserted);
      return json(200, { success: true, document: toCamel(inserted), suspects });
    }

    // ── list ──────────────────────────────────────────────────────────────
    if (action === 'list') {
      let q = supabase.from('documents').select('*').order('doc_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      // ברירת מחדל: בלי מסמכי ארכיון. archivedOnly=true — רק ארכיון.
      if (body.archivedOnly === true) q = q.not('archived_at', 'is', null);
      else q = q.is('archived_at', null);
      if (body.direction) q = q.eq('direction', body.direction);
      if (body.reviewStatus) q = q.eq('review_status', body.reviewStatus);
      if (body.monthKey && /^\d{4}-\d{2}$/.test(body.monthKey)) {
        const [y, m] = body.monthKey.split('-').map(Number);
        const from = `${body.monthKey}-01`;
        const to = new Date(y, m, 0).toISOString().slice(0, 10);
        q = q.gte('doc_date', from).lte('doc_date', to);
      }
      const { data: rows, error } = await q;
      if (error) throw error;
      const ids = (rows || []).map(r => r.id);
      let sourcesByDoc = {};
      if (ids.length) {
        const { data: sources } = await supabase
          .from('document_sources')
          .select('document_id, source_kind, source_ref, added_at')
          .in('document_id', ids);
        for (const s of sources || []) {
          (sourcesByDoc[s.document_id] ||= []).push(toCamel(s));
        }
      }
      // סימון חשדות כפילות בתוך התוצאה — לפי אותם כללים (מספר+סוג),
      // כך שחשבונית וקבלה על אותה עסקה לא מסומנות ככפילות.
      const documents = (rows || []).map(r => ({
        ...toCamel(r),
        sources: sourcesByDoc[r.id] || [],
        duplicateSuspect: (rows || []).some(o => o.id !== r.id && isDuplicatePair(r, o)),
      }));
      return json(200, { success: true, documents });
    }

    // ── update ────────────────────────────────────────────────────────────
    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) return json(400, { success: false, error: 'נדרש id' });
      const data = pickDocFields(body.data);
      delete data.fileHash; // אין לשנות hash אחרי יצירה
      delete data.filePath;
      const row = { ...toSnake(data), updated_at: new Date().toISOString() };
      const { data: updated, error } = await supabase.from('documents').update(row).eq('id', id).select().single();
      if (error) throw error;
      const suspects = await findSuspects(supabase, updated);
      return json(200, { success: true, document: toCamel(updated), suspects });
    }

    // ── archive / restore: אין מחיקה לצמיתות בשלב הניסיון ────────────────
    if (action === 'archive' || action === 'restore') {
      const id = String(body.id || '');
      if (!id) return json(400, { success: false, error: 'נדרש id' });
      const { data: updated, error } = await supabase
        .from('documents')
        .update({ archived_at: action === 'archive' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return json(200, { success: true, document: toCamel(updated) });
    }

    // ── fileUrl: signed URL לצפייה ───────────────────────────────────────
    if (action === 'fileUrl') {
      const id = String(body.id || '');
      const { data: doc, error } = await supabase.from('documents').select('file_path').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!doc?.file_path) return json(404, { success: false, error: 'למסמך אין קובץ' });
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.file_path, 3600);
      if (signErr) throw signErr;
      return json(200, { success: true, url: signed.signedUrl });
    }

    // ── addSource: מקור נוסף לאותו מסמך (מייל/Drive בעתיד) ───────────────
    if (action === 'addSource') {
      const id = String(body.id || '');
      if (!id || !body.kind) return json(400, { success: false, error: 'נדרשים id ו-kind' });
      const { error } = await supabase.from('document_sources').insert([{
        id: newId('src'),
        document_id: id,
        source_kind: body.kind,
        source_ref: body.ref || null,
      }]);
      if (error && String(error.code) !== '23505') throw error;
      return json(200, { success: true });
    }

    return json(400, { success: false, error: `Unknown action: ${action}` });
  } catch (e) {
    return json(500, { success: false, error: e.message || String(e) });
  }
};
