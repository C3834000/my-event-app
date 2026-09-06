// ============================================================================
// ייבוא ממצאי הסריקה למאגר המסמכים בסביבת הבדיקה — עד 20 מסמכים מחודש אחד.
// - קריאה בלבד מהקבצים המקוריים (לא מזיז/משנה/מוחק).
// - תאריך נקבע רק אם זוהה בבירור מתוך תוכן המסמך; אחרת נשאר ריק + הערה.
// - כל מיקום מקורי נרשם כמקור (source kind='folder').
// הרצה: node scripts/import-scanned.mjs [YYYY-MM] (ברירת מחדל: 2025-05)
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const MONTH = process.argv[2] || '2025-05';
const BASE = 'http://localhost:4000';
const LIMIT = 20;

const KEY = fs.readFileSync('.env.documents-test', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const F = JSON.parse(fs.readFileSync('test-env/scan/findings.json', 'utf8'));

const api = async (body) => {
  const res = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ── בחירת המסמכים של החודש ──────────────────────────────────────────────────
const inInvoiceContext = (d) => d.locations.some(p => /חשבונ|קבל|הוצא|invoice|receipt/i.test(p));
const filenameMonth = (name) => {
  const m = name.match(/(202[456])(\d{2})(\d{2})/);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${m[2]}` : null;
};

const cohort = [];
for (const d of F.documents) {
  if (!inInvoiceContext(d)) continue;
  if (d.ext !== '.pdf' && !d.isInvoiceLike) continue; // תמונות בלי אימות תוכן — לא בסבב הראשון
  const contentMonth = d.dateStatus === 'clear' ? d.detectedDate.slice(0, 7) : null;
  const nameMonth = filenameMonth(d.fileName);
  // בטיחות: אם שם הקובץ סותר את השנה שזוהתה בתוכן — לא סומכים על התאריך
  const conflict = contentMonth && nameMonth && contentMonth.slice(0, 4) !== nameMonth.slice(0, 4);
  if (contentMonth === MONTH && !conflict) {
    cohort.push({ d, docDate: d.detectedDate, dateSource: 'תוכן המסמך' });
  } else if (!contentMonth && nameMonth === MONTH) {
    cohort.push({ d, docDate: null, dateSource: `שם הקובץ מרמז על ${MONTH} — לא אומת בתוכן` });
  }
}
cohort.sort((a, b) => (a.docDate || '9') < (b.docDate || '9') ? -1 : 1);
const batch = cohort.slice(0, LIMIT);
console.log(`חודש ${MONTH}: ${cohort.length} מסמכים ייחודיים, מייבא ${batch.length}`);

// ── ייבוא ───────────────────────────────────────────────────────────────────
const log = [`# ייבוא ${MONTH} — ${new Date().toLocaleString('he-IL')}`, ''];
let ok = 0, dup = 0, fail = 0;

for (const { d, docDate, dateSource } of batch) {
  const primary = d.locations[0];
  try {
    const buf = fs.readFileSync(primary); // קריאה בלבד
    const init = await api({ action: 'initUpload', fileHash: d.hash, fileName: d.fileName, fileMime: 'application/pdf', fileSize: buf.length });
    if (init.body.duplicate) {
      dup++;
      log.push(`⚠ כבר קיים במאגר: ${d.fileName}`);
      continue;
    }
    if (!init.body.uploadUrl) throw new Error(init.body.error || 'אין כתובת העלאה');
    const put = await fetch(init.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: buf });
    if (!put.ok) throw new Error(`PUT ${put.status}`);

    const notes = [
      `יובא מסריקת מחשב · מקור: ${primary}`,
      docDate ? `תאריך מתוך תוכן המסמך` : `⚠ ${dateSource} — יש להשלים תאריך ידנית`,
      d.review.length ? `לבדיקה: ${d.review.join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    const create = await api({ action: 'create', data: {
      direction: 'expense', // תיקיות "חשבוניות" של הוצאות לרו"ח — לאימות בבדיקה
      docType: d.docType || null,
      docNumber: d.docNumber || null,
      docDate,
      totalAmount: null,      // אין ניחוש סכומים — הזנה ידנית בבדיקה
      notes,
      filePath: init.body.path,
      fileHash: d.hash,
      fileName: d.fileName,
      fileMime: 'application/pdf',
      fileSize: buf.length,
      reviewStatus: 'needs_review',
    }, source: { kind: 'folder', ref: primary } });

    if (create.status !== 200) throw new Error(create.body.error || `HTTP ${create.status}`);
    const docId = create.body.document.id;
    // רישום כל שאר המיקומים שבהם נמצא אותו קובץ
    for (const loc of d.locations.slice(1)) {
      await api({ action: 'addSource', id: docId, kind: 'folder', ref: loc });
    }
    ok++;
    log.push(`✓ ${d.fileName} · ${d.docType || 'סוג לא זוהה'} · ${docDate || 'ללא תאריך (לבדיקה)'} · ${d.locations.length} מיקומים`);
  } catch (e) {
    fail++;
    log.push(`✗ ${d.fileName}: ${e.message}`);
  }
}

log.push('', `סיכום: ${ok} יובאו, ${dup} כבר היו קיימים, ${fail} נכשלו`);
fs.writeFileSync('test-env/scan/import-log.md', log.join('\n'), 'utf8');
console.log(log.join('\n'));
