// ============================================================================
// בדיקות חיות מקצה-לקצה מול שרת הבדיקה האמיתי — HTTP אמיתי, קבצים אמיתיים
// על הדיסק, הפונקציה האמיתית. תיקיית נתונים נפרדת (test-env-live) שנמחקת
// בתחילת כל ריצה. אין נגיעה בנתוני המשתמש (test-env) או בייצור.
// הרצה:  node scripts/test-documents-live.mjs
// ============================================================================
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const PORT = 4900;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = path.join(ROOT, 'test-env-live');

// ניקוי תיקיית הבדיקות
fs.rmSync(DATA_DIR, { recursive: true, force: true });

// ── הפעלת השרת (שרת בלבד, בלי vite) ─────────────────────────────────────────
const server = spawn(process.execPath, [
  '--import', './scripts/local-supabase-register.mjs',
  'scripts/docs-test-server.mjs', '--no-vite',
], {
  cwd: ROOT,
  env: { ...process.env, DOCS_TEST_PORT: String(PORT), DOCS_TEST_DATA_DIR: 'test-env-live' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.stderr.write(`[server] ${d}`));

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* עוד לא עלה */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('השרת לא עלה');
}
await waitReady();

// המפתח נוצר על ידי השרת ונשמר ב-.env.documents-test
const KEY = fs.readFileSync(path.join(ROOT, '.env.documents-test'), 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();

let passed = 0, failed = 0;
const out = [];
const check = (name, cond, extra = '') => {
  if (cond) { passed++; out.push(`  ✓ ${name}`); }
  else { failed++; out.push(`  ✗ ${name} ${extra}`); }
};

const api = async (body, key = KEY) => {
  const res = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key == null ? {} : { 'x-docs-key': key }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// קובץ PDF מינימלי אמיתי + hash אמיתי — בדיוק כמו שהדפדפן עושה
const makePdf = (marker) => Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** הזרימה המלאה של הלקוח: initUpload → PUT bytes → create */
async function uploadFlow(buf, fileName, data = {}, { skipPut = false } = {}) {
  const hash = sha256(buf);
  const init = await api({ action: 'initUpload', fileHash: hash, fileName, fileMime: 'application/pdf', fileSize: buf.length });
  if (init.body.duplicate) return { init, hash };
  let putStatus = null;
  if (!skipPut) {
    const put = await fetch(init.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: buf });
    putStatus = put.status;
    if (!put.ok) return { init, hash, putStatus };
  } else {
    return { init, hash };
  }
  const create = await api({ action: 'create', data: {
    direction: 'expense', filePath: init.body.path, fileHash: hash, fileName,
    fileMime: 'application/pdf', fileSize: buf.length, reviewStatus: 'needs_review', ...data,
  }, source: { kind: 'manual', ref: fileName } });
  return { init, hash, putStatus, create };
}

try {
  // ── 1. בריאות + הרשאות ────────────────────────────────────────────────────
  check('שרת חי (/health)', (await fetch(`${BASE}/health`)).ok);
  check('list בלי מפתח → 401', (await api({ action: 'list' }, null)).status === 401);
  check('list עם מפתח שגוי → 401', (await api({ action: 'list' }, 'wrong')).status === 401);
  check('גישה ישירה לאחסון → 403', (await fetch(`${BASE}/storage/anything.pdf`)).status === 403);
  check('טוקן צפייה מזויף → 403', (await fetch(`${BASE}/storage/signed/${'ab'.repeat(24)}`)).status === 403);
  check('נתיב ח"י מנוטרל בסביבה → 404', (await fetch(`${BASE}/api/green-invoice`, { method: 'POST' })).status === 404);

  // ── 2. העלאה מלאה + צפייה בבייטים המקוריים ────────────────────────────────
  const pdfA = makePdf('supplier-office-invoice-101');
  const A = await uploadFlow(pdfA, 'חשבונית ציוד.pdf', { docType: 'חשבונית מס', counterparty: 'אופיס דיפו', docNumber: '101', docDate: '2026-08-05', totalAmount: 1170 });
  check('העלאה מלאה: PUT הצליח', A.putStatus === 200);
  check('העלאה מלאה: נוצרה רשומה', A.create.status === 200 && !!A.create.body.document?.id);
  const docA = A.create.body.document;
  {
    const fu = await api({ action: 'fileUrl', id: docA.id });
    check('fileUrl מחזיר כתובת חתומה', fu.status === 200 && fu.body.url.includes('/storage/signed/'));
    const got = await fetch(fu.body.url);
    const bytes = Buffer.from(await got.arrayBuffer());
    check('הקובץ שהורד זהה בייט-בייט למקור', got.status === 200 && bytes.equals(pdfA));
    check('ה-mime נשמר (application/pdf)', got.headers.get('content-type') === 'application/pdf');
    const fileOnDisk = fs.readdirSync(path.join(DATA_DIR, 'storage')).length;
    check('הקובץ קיים פיזית על הדיסק', fileOnDisk >= 1);
  }

  // ── 3. העלאה חוזרת של אותו קובץ ───────────────────────────────────────────
  {
    const again = await uploadFlow(pdfA, 'עותק.pdf');
    check('העלאה חוזרת מזוהה לפי hash — לא נוצר כפול', again.init.body.duplicate === true);
    check('מוחזר המסמך הקיים', again.init.body.existing?.counterparty === 'אופיס דיפו');
  }

  // ── 4. שתי העלאות במקביל של אותו קובץ חדש ─────────────────────────────────
  {
    const pdfR = makePdf('race-file-999');
    const [r1, r2] = await Promise.all([
      uploadFlow(pdfR, 'race1.pdf', { docNumber: '900' }),
      uploadFlow(pdfR, 'race2.pdf', { docNumber: '900' }),
    ]);
    const results = [r1, r2].map(r => r.init.body.duplicate ? 'dup' : (r.create?.status ?? 'none'));
    const okCount = results.filter(s => s === 200).length;
    const blocked = results.filter(s => s === 409 || s === 'dup').length;
    check('מקביליות: בדיוק אחת נשמרת, השנייה נחסמת', okCount === 1 && blocked === 1, JSON.stringify(results));
    const list = await api({ action: 'list' });
    check('מקביליות: רשומה אחת בלבד במאגר', list.body.documents.filter(d => d.fileHash === sha256(pdfR)).length === 1);
  }

  // ── 5. טוקן העלאה חד-פעמי ─────────────────────────────────────────────────
  {
    const pdfT = makePdf('token-reuse');
    const hash = sha256(pdfT);
    const init = await api({ action: 'initUpload', fileHash: hash, fileName: 't.pdf' });
    const put1 = await fetch(init.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdfT });
    const put2 = await fetch(init.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdfT });
    check('טוקן העלאה עובד פעם אחת בלבד', put1.status === 200 && put2.status === 403);
  }

  // ── 6. העלאה שנכשלה — אין רשומת רפאים ─────────────────────────────────────
  {
    const before = (await api({ action: 'list' })).body.documents.length;
    await uploadFlow(makePdf('will-fail'), 'fail.pdf', {}, { skipPut: true }); // PUT לא בוצע → הלקוח לא יוצר רשומה
    const after = (await api({ action: 'list' })).body.documents.length;
    check('העלאה שלא הושלמה לא משאירה רשומה', after === before);
  }

  // ── 7. שני מסמכים שונים באותו סכום ────────────────────────────────────────
  {
    const e1 = await uploadFlow(makePdf('electric-aug'), 'חשמל.pdf', { docType: 'חשבונית מס', counterparty: 'חברת החשמל', docNumber: '7001', totalAmount: 500, docDate: '2026-08-10' });
    const e2 = await uploadFlow(makePdf('water-aug'), 'מים.pdf', { docType: 'חשבונית מס', counterparty: 'תאגיד המים', docNumber: '7002', totalAmount: 500, docDate: '2026-08-11' });
    check('שני מסמכים באותו סכום נשמרים', e1.create.status === 200 && e2.create.status === 200);
    check('סכום זהה לבדו אינו חשד לכפילות', e1.create.body.suspects.length === 0 && e2.create.body.suspects.length === 0);
  }

  // ── 8. חשבונית + קבלה על אותה עסקה — לא כפילות ───────────────────────────
  {
    const inv = await uploadFlow(makePdf('gi-inv-555'), 'inv555.pdf', { direction: 'income', docType: 'חשבונית מס', counterparty: 'לקוח כהן', docNumber: '555', totalAmount: 2340, docDate: '2026-08-15' });
    const rec = await uploadFlow(makePdf('gi-rec-555'), 'rec555.pdf', { direction: 'income', docType: 'קבלה', counterparty: 'לקוח כהן', docNumber: '555', totalAmount: 2340, docDate: '2026-08-15' });
    check('חשבונית וקבלה נשמרות כשני מסמכים', inv.create.status === 200 && rec.create.status === 200);
    check('חשבונית+קבלה אותו מספר — לא מסומנות ככפילות', rec.create.body.suspects.length === 0);
    const list = await api({ action: 'list' });
    const pair = list.body.documents.filter(d => d.docNumber === '555');
    check('אין דגל כפילות ברשימה על חשבונית+קבלה', pair.length === 2 && pair.every(d => !d.duplicateSuspect));
    // כפילות אמיתית: אותו סוג + אותו מספר
    const inv2 = await uploadFlow(makePdf('gi-inv-555-dup'), 'inv555b.pdf', { direction: 'income', docType: 'חשבונית מס', counterparty: 'לקוח כהן', docNumber: '555', totalAmount: 2340 });
    check('חשבונית שנייה עם אותו מספר+סוג — כן מסומנת כחשד', inv2.create.status === 200 && inv2.create.body.suspects.length === 1);
    const list2 = await api({ action: 'list' });
    const rec555 = list2.body.documents.find(d => d.docNumber === '555' && d.docType === 'קבלה');
    check('הקבלה עדיין לא מסומנת ככפילות', rec555 && !rec555.duplicateSuspect);
  }

  // ── 9. עריכה, אישור, סינון ────────────────────────────────────────────────
  {
    const upd = await api({ action: 'update', id: docA.id, data: { counterparty: 'אופיס דיפו בע"מ', vatAmount: 170, netAmount: 1000 } });
    check('עריכה נשמרת', upd.status === 200 && upd.body.document.counterparty === 'אופיס דיפו בע"מ');
    const appr = await api({ action: 'update', id: docA.id, data: { reviewStatus: 'confirmed' } });
    check('אישור מסמך', appr.body.document.reviewStatus === 'confirmed');
    const filt = await api({ action: 'list', reviewStatus: 'confirmed' });
    check('סינון לפי מאושר', filt.body.documents.some(d => d.id === docA.id) && filt.body.documents.every(d => d.reviewStatus === 'confirmed'));
    const aug = await api({ action: 'list', monthKey: '2026-08' });
    check('סינון לפי חודש', aug.body.documents.every(d => (d.docDate || '').startsWith('2026-08')));
  }

  // ── 10. ארכיון ושחזור — הקובץ לא נמחק ─────────────────────────────────────
  {
    const arch = await api({ action: 'archive', id: docA.id });
    check('העברה לארכיון', arch.status === 200 && !!arch.body.document.archivedAt);
    const list = await api({ action: 'list' });
    check('לא מופיע ברשימה הרגילה', !list.body.documents.some(d => d.id === docA.id));
    const archList = await api({ action: 'list', archivedOnly: true });
    check('מופיע בתצוגת הארכיון', archList.body.documents.some(d => d.id === docA.id));
    const fu = await api({ action: 'fileUrl', id: docA.id });
    const got = fu.status === 200 ? await fetch(fu.body.url) : { status: 0 };
    check('הקובץ נגיש גם בארכיון — לא נמחק', got.status === 200);
    const rest = await api({ action: 'restore', id: docA.id });
    check('שחזור מהארכיון', rest.status === 200 && rest.body.document.archivedAt == null);
    check('אין פעולת מחיקה לצמיתות', (await api({ action: 'delete', id: docA.id })).status === 400);
  }

  // ── 11. עמידות: הנתונים באמת על הדיסק ─────────────────────────────────────
  {
    const dbOnDisk = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));
    check('הרשומות נשמרות לדיסק (עמידות בין הפעלות)', (dbOnDisk.documents || []).length >= 5);
  }
} finally {
  server.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

console.log('\n=== בדיקות חיות מול שרת הבדיקה (HTTP + קבצים אמיתיים) ===\n');
console.log(out.join('\n'));
console.log(`\nסה"כ: ${passed} עברו, ${failed} נכשלו`);
process.exit(failed > 0 ? 1 : 0);
