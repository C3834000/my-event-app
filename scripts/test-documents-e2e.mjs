// ============================================================================
// בדיקות מקצה-לקצה של netlify/functions/documents.js — הפונקציה האמיתית,
// מול Supabase מדומה בזיכרון (ללא רשת, ללא ייצור).
// הרצה:  node --import ./scripts/mock-supabase-register.mjs scripts/test-documents-e2e.mjs
// ============================================================================
import { resetMockState, mockUploadFile } from './mock-supabase.mjs';

const TEST_KEY = 'test-docs-key-1234';
const SERVICE_KEY = 'sb-service-role-SECRET-do-not-leak';

process.env.VITE_SUPABASE_URL = 'https://mock.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
delete process.env.DOCS_API_KEY; // נבדוק קודם התנהגות ללא מפתח

const { handler } = await import('../netlify/functions/documents.js');

let passed = 0, failed = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; results.push(`  ✓ ${name}`); }
  else { failed++; results.push(`  ✗ ${name} ${extra}`); }
}

async function call(body, key = TEST_KEY) {
  const res = await handler({
    httpMethod: 'POST',
    headers: key == null ? {} : { 'x-docs-key': key },
    body: JSON.stringify(body),
  });
  return { status: res.statusCode, body: JSON.parse(res.body || '{}'), raw: res.body };
}

const hashOf = (s) => {
  // hash דטרמיניסטי באורך 64 hex לצורך הבדיקות
  let h = '';
  for (let i = 0; i < 64; i++) h += (s.charCodeAt(i % s.length) % 16).toString(16);
  return h;
};

// ── 1. אבטחה: ללא DOCS_API_KEY בשרת — הכל נעול ─────────────────────────────
{
  const r = await call({ action: 'list' });
  check('שרת ללא DOCS_API_KEY → 503 (נעול)', r.status === 503);
}
process.env.DOCS_API_KEY = TEST_KEY;

// ── 2. אבטחה: בקשות ללא מפתח / מפתח שגוי — נחסמות לכל פעולה ────────────────
for (const action of ['list', 'create', 'update', 'archive', 'restore', 'fileUrl', 'initUpload', 'addSource']) {
  const noKey = await call({ action }, null);
  const badKey = await call({ action }, 'wrong-key');
  check(`פעולת ${action} ללא מפתח → 401`, noKey.status === 401);
  check(`פעולת ${action} עם מפתח שגוי → 401`, badKey.status === 401);
}

// ── 3. העלאה מלאה + פתיחת מקור ─────────────────────────────────────────────
resetMockState();
const hashA = hashOf('invoice-office-depot');
{
  const init = await call({ action: 'initUpload', fileHash: hashA, fileName: 'חשבונית ציוד.pdf', fileMime: 'application/pdf', fileSize: 1000 });
  check('initUpload לקובץ חדש → uploadUrl', init.status === 200 && !init.body.duplicate && !!init.body.uploadUrl);
  mockUploadFile(init.body.path, true); // סימולציית PUT מוצלח
  const create = await call({ action: 'create', data: {
    direction: 'expense', docType: 'חשבונית מס', counterparty: 'אופיס דיפו',
    docNumber: '100', docDate: '2026-08-05', totalAmount: 1170, vatAmount: 170, netAmount: 1000,
    filePath: init.body.path, fileHash: hashA, fileName: 'חשבונית ציוד.pdf', fileMime: 'application/pdf', fileSize: 1000,
    reviewStatus: 'needs_review',
  }, source: { kind: 'manual', ref: 'חשבונית ציוד.pdf' } });
  check('יצירת מסמך ראשון מצליחה', create.status === 200 && create.body.document?.id);
  globalThis.__docA = create.body.document;
  const fileUrl = await call({ action: 'fileUrl', id: create.body.document.id });
  check('פתיחת קובץ מקור → signed URL', fileUrl.status === 200 && String(fileUrl.body.url || '').includes('signed'));
}

// ── 4. העלאה חוזרת של אותו קובץ → מזוהה, לא נוצר כפול ──────────────────────
{
  const again = await call({ action: 'initUpload', fileHash: hashA, fileName: 'עותק של חשבונית.pdf' });
  check('העלאה חוזרת של אותו קובץ → duplicate=true', again.status === 200 && again.body.duplicate === true);
  check('הכפילות מחזירה את המסמך הקיים', again.body.existing?.counterparty === 'אופיס דיפו');
}

// ── 5. מרוץ: שתי העלאות מקבילות של אותו קובץ חדש ───────────────────────────
{
  const hashR = hashOf('race-file');
  // שני לקוחות עוברים initUpload לפני שנוצרה רשומה (המצב האמיתי במרוץ)
  const [i1, i2] = await Promise.all([
    call({ action: 'initUpload', fileHash: hashR, fileName: 'race.pdf' }),
    call({ action: 'initUpload', fileHash: hashR, fileName: 'race.pdf' }),
  ]);
  check('מרוץ: שני initUpload עוברים (עדיין אין רשומה)', !i1.body.duplicate && !i2.body.duplicate);
  mockUploadFile(i1.body.path, true);
  const mk = (n) => call({ action: 'create', data: { direction: 'expense', fileHash: hashR, filePath: i1.body.path, fileName: `race${n}.pdf` } });
  const [c1, c2] = await Promise.all([mk(1), mk(2)]);
  const oks = [c1, c2].filter(r => r.status === 200).length;
  const dups = [c1, c2].filter(r => r.status === 409 && r.body.duplicate).length;
  check('מרוץ: בדיוק יצירה אחת מצליחה, השנייה נחסמת ב-unique (409)', oks === 1 && dups === 1, `got ${c1.status}/${c2.status}`);
  const list = await call({ action: 'list' });
  check('מרוץ: נשמרה רשומה אחת בלבד', list.body.documents.filter(d => d.fileHash === hashR).length === 1);
}

// ── 6. שני מסמכים שונים עם אותו סכום — שניהם נשמרים ────────────────────────
{
  const h1 = hashOf('electric-bill'), h2 = hashOf('water-bill');
  const mk = (h, name, num) => call({ action: 'create', data: {
    direction: 'expense', docType: 'חשבונית מס', counterparty: name, docNumber: num,
    docDate: '2026-08-10', totalAmount: 500, fileHash: h, fileName: `${name}.pdf`,
  } });
  const r1 = await mk(h1, 'חברת החשמל', '200');
  const r2 = await mk(h2, 'תאגיד המים', '300');
  check('שני מסמכים שונים באותו סכום (500₪) נשמרים שניהם', r1.status === 200 && r2.status === 200);
  check('אין סימון כפילות על סכום זהה בלבד', r1.body.suspects.length === 0 && r2.body.suspects.length === 0);
}

// ── 7. חשבונית + קבלה = שני מסמכים נפרדים, לא כפילות ────────────────────────
{
  const hInv = hashOf('gi-invoice-555'), hRec = hashOf('gi-receipt-555'), hInv2 = hashOf('gi-invoice-555-dup');
  const inv = await call({ action: 'create', data: { direction: 'income', docType: 'חשבונית מס', counterparty: 'לקוח כהן', docNumber: '555', docDate: '2026-08-15', totalAmount: 2340, fileHash: hInv, fileName: 'inv.pdf' } });
  const rec = await call({ action: 'create', data: { direction: 'income', docType: 'קבלה', counterparty: 'לקוח כהן', docNumber: '555', docDate: '2026-08-15', totalAmount: 2340, fileHash: hRec, fileName: 'rec.pdf' } });
  check('חשבונית וקבלה נשמרות כשני מסמכים נפרדים', inv.status === 200 && rec.status === 200 && inv.body.document.id !== rec.body.document.id);
  check('חשבונית+קבלה על אותה עסקה — לא מסומנות ככפילות', rec.body.suspects.length === 0);
  const list = await call({ action: 'list' });
  const both = list.body.documents.filter(d => d.docNumber === '555');
  check('אין דגל כפילות ברשימה על חשבונית+קבלה', both.length === 2 && both.every(d => !d.duplicateSuspect));
  // כפילות אמיתית: אותו סוג + אותו מספר → כן מסומנת
  const inv2 = await call({ action: 'create', data: { direction: 'income', docType: 'חשבונית מס', counterparty: 'לקוח כהן', docNumber: '555', totalAmount: 2340, fileHash: hInv2, fileName: 'inv2.pdf' } });
  check('חשבונית שנייה עם אותו מספר+סוג — כן חשד לכפילות', inv2.status === 200 && inv2.body.suspects.length === 1);
  const list2 = await call({ action: 'list' });
  const rec555 = list2.body.documents.find(d => d.docNumber === '555' && d.docType === 'קבלה');
  check('הקבלה נשארת ללא דגל כפילות', rec555 && !rec555.duplicateSuspect);
}

// ── 8. העלאה שנכשלה — לא נשארת רשומה ───────────────────────────────────────
{
  const hFail = hashOf('failed-upload');
  const before = (await call({ action: 'list' })).body.documents.length;
  const init = await call({ action: 'initUpload', fileHash: hFail, fileName: 'fail.pdf' });
  check('initUpload לקובץ שייכשל → מקבל כתובת', init.status === 200 && !!init.body.uploadUrl);
  const uploadOk = mockUploadFile(init.body.path, false); // ה-PUT נכשל
  check('ה-PUT נכשל (סימולציה)', uploadOk === false);
  // הלקוח לא קורא create אחרי כישלון PUT (כך בנוי services/documents.ts)
  const after = (await call({ action: 'list' })).body.documents.length;
  check('אחרי כישלון העלאה — לא נוספה רשומה', after === before);
}

// ── 9. עריכה, אישור וסינון ─────────────────────────────────────────────────
{
  const docA = globalThis.__docA;
  const upd = await call({ action: 'update', id: docA.id, data: { counterparty: 'אופיס דיפו בע"מ', vatAmount: 170, fileHash: 'deadbeef'.repeat(8) } });
  check('עריכת פרטים מצליחה', upd.status === 200 && upd.body.document.counterparty === 'אופיס דיפו בע"מ');
  check('ניסיון לשנות fileHash בעדכון — מסונן', upd.body.document.fileHash === hashA);
  const approve = await call({ action: 'update', id: docA.id, data: { reviewStatus: 'confirmed' } });
  check('אישור מסמך (confirmed)', approve.body.document.reviewStatus === 'confirmed');
  const onlyConfirmed = await call({ action: 'list', reviewStatus: 'confirmed' });
  check('סינון לפי סטטוס מאושר', onlyConfirmed.body.documents.every(d => d.reviewStatus === 'confirmed') && onlyConfirmed.body.documents.some(d => d.id === docA.id));
  const aug = await call({ action: 'list', monthKey: '2026-08' });
  check('סינון לפי חודש 2026-08', aug.body.documents.length >= 3 && aug.body.documents.every(d => (d.docDate || '').startsWith('2026-08')));
  const income = await call({ action: 'list', direction: 'income' });
  check('סינון לפי כיוון הכנסה', income.body.documents.every(d => d.direction === 'income'));
}

// ── 10. ארכיון במקום מחיקה + שחזור ─────────────────────────────────────────
{
  const docA = globalThis.__docA;
  const arch = await call({ action: 'archive', id: docA.id });
  check('העברה לארכיון מצליחה', arch.status === 200 && !!arch.body.document.archivedAt);
  const list = await call({ action: 'list' });
  check('מסמך בארכיון לא מופיע ברשימה הרגילה', !list.body.documents.some(d => d.id === docA.id));
  const archList = await call({ action: 'list', archivedOnly: true });
  check('מסמך מופיע ברשימת הארכיון', archList.body.documents.some(d => d.id === docA.id));
  const fileStill = await call({ action: 'fileUrl', id: docA.id });
  check('הקובץ המקורי לא נמחק — עדיין נגיש מהארכיון', fileStill.status === 200);
  const rest = await call({ action: 'restore', id: docA.id });
  check('שחזור מהארכיון', rest.status === 200 && rest.body.document.archivedAt == null);
  const list2 = await call({ action: 'list' });
  check('אחרי שחזור — חוזר לרשימה הרגילה', list2.body.documents.some(d => d.id === docA.id));
  check('אין בכלל פעולת מחיקה לצמיתות', (await call({ action: 'delete', id: docA.id })).status === 400);
}

// ── 11. מפתח service לא דולף בתשובות ───────────────────────────────────────
{
  const all = await Promise.all([
    call({ action: 'list' }),
    call({ action: 'list', archivedOnly: true }),
    call({ action: 'fileUrl', id: globalThis.__docA.id }),
    call({ action: 'initUpload', fileHash: hashOf('leak-check'), fileName: 'x.pdf' }),
  ]);
  const leaked = all.some(r => r.raw.includes(SERVICE_KEY));
  check('מפתח ה-service לא מופיע באף תשובה', !leaked);
}

// ── 12. ולידציות קלט ───────────────────────────────────────────────────────
{
  const badHash = await call({ action: 'initUpload', fileHash: 'not-a-hash' });
  check('hash לא תקין → 400', badHash.status === 400);
  const badDir = await call({ action: 'create', data: { direction: 'sideways' } });
  check('direction לא חוקי → 400', badDir.status === 400);
  const evil = await call({ action: 'create', data: { direction: 'expense', fileHash: hashOf('evil'), evilField: 'DROP TABLE', role: 'admin' } });
  check('שדות לא מוכרים מסוננים ביצירה', evil.status === 200 && !('evilField' in evil.body.document) && !('role' in evil.body.document));
}

console.log('\n=== תוצאות בדיקות מקצה-לקצה — פונקציית המסמכים ===\n');
console.log(results.join('\n'));
console.log(`\nסה"כ: ${passed} עברו, ${failed} נכשלו`);
process.exit(failed > 0 ? 1 : 0);
