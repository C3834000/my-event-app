// ============================================================================
// ניקוי שיוכים שגויים של החילוץ האוטומטי במאגר המסמכים (ייצור).
// 1. כרטסת/דפי פירוט אשראי — אלה מסמכי עזר, לא חשבוניות: מסומנים docType="אחר",
//    הסכומים שחולצו מהם נמחקים (מטעים — אלה סיכומי עסקאות), סטטוס "לבדיקה".
// 2. שמות ספק שהם זבל טקסט (שורות שגויות מה-PDF) — מנוקים ל-null + "לבדיקה".
// 3. תיקוני היפוך עברית ידועים (מרזכ→מרכז).
// הרצה: node scripts/cleanup-extract.mjs [--apply]
// ============================================================================
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const BASE = 'https://myecrm2026.netlify.app';

const api = async (body) => {
  const res = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// שמות ספק שהם בבירור שורות טקסט שגויות ולא שם עסק
const JUNK_COUNTERPARTIES = [
  'מיני לוגו כאל כללי VS', 'קליכיף :הלקוח שם', 'מספר זהות', 'בס"ד',
  'לחשבון כספים העברת', 'חברה', 'חודשי מחיר', 'כתובת', 'יבוטל שלך המינוי',
  'moc.ia-xobysae.www//:sptth/', 'חשבונאות - ביקורת - יעוץ', 'עסקאות וחיובים',
  'מ"במע חייב', 'מ"מע לפני כ"סה₪136.75', 'ראשון לציון', 'א אדר ב תשפ"ד',
  'קריאה', 'וחותמתחתימה', 'פסח בערב אשראי כרטיס המספר את לו שנתת מי',
  'שח 900 חוב מזכירה', 'RECEIPT', 'Page 1 of 1', 'INVOICE',
  '-העברה לחשבון אחר עובר ושב', 'תוכניקל', 'מ"במע חייב',
];
// תיקוני היפוך ידועים
const FIX_REVERSED = { 'מרזכ הצדקה': 'מרכז הצדקה' };

// זיהוי מסמך עזר (לא חשבונית): כרטסת רו"ח או דף פירוט כרטיס אשראי
const isReferenceDoc = (d, sourceRefs) => {
  const name = d.fileName || '';
  const inStatementFolder = sourceRefs.some(r => /פירוט כ אשראי/.test(r));
  return /כרטסת|דף פירוט|פירוט עסקאות|פירוט חיובים/.test(name) || inStatementFolder;
};

const { body: listBody } = await api({ action: 'list', limit: 1000 });
const docs = listBody.documents || [];
console.log(`נבדקים ${docs.length} מסמכים פעילים...`);

const changes = [];
for (const d of docs) {
  const sourceRefs = (d.sources || []).map(s => s.ref || '');
  const patch = {};
  const reasons = [];

  if (isReferenceDoc(d, sourceRefs)) {
    // מסמך עזר: לא חשבונית — בלי ספק, בלי סכומים, לבדיקה
    if (d.docType !== 'אחר') { patch.docType = 'אחר'; }
    if (d.totalAmount != null) { patch.totalAmount = null; patch.netAmount = null; patch.vatAmount = null; }
    // ספק: דף אשראי → חברת הכרטיס אם זוהתה; כרטסת → ריק
    if (/כרטסת/.test(d.fileName || '')) {
      if (d.counterparty) patch.counterparty = null;
      if (d.docDate) patch.docDate = null; // תאריך ההדפסה מטעה
    } else if (d.counterparty && !/כאל|ישראכרט|מקס|לאומי קארד/.test(d.counterparty)) {
      patch.counterparty = /כאל/.test((d.fileName || '') + sourceRefs.join(' ')) ? 'כאל (דף פירוט)' : null;
    }
    if (d.reviewStatus !== 'needs_review') patch.reviewStatus = 'needs_review';
    const marker = 'מסמך עזר (כרטסת/דף פירוט) — לא חשבונית הוצאה';
    if (!(d.notes || '').includes(marker)) patch.notes = [(d.notes || ''), `⚠ ${marker}; הסכומים אינם נספרים כהוצאה.`].filter(Boolean).join('\n');
    if (Object.keys(patch).length) reasons.push('מסמך עזר');
  } else if (d.counterparty && JUNK_COUNTERPARTIES.includes(d.counterparty.trim())) {
    patch.counterparty = null;
    if (d.reviewStatus !== 'needs_review') patch.reviewStatus = 'needs_review';
    reasons.push(`ספק זבל: "${d.counterparty}"`);
  } else if (d.counterparty && FIX_REVERSED[d.counterparty.trim()]) {
    patch.counterparty = FIX_REVERSED[d.counterparty.trim()];
    reasons.push(`תיקון היפוך: ${d.counterparty} → ${patch.counterparty}`);
  }

  if (Object.keys(patch).length) changes.push({ id: d.id, fileName: d.fileName, patch, reasons });
}

console.log(`נמצאו ${changes.length} מסמכים לתיקון`);
for (const c of changes) console.log(`- ${c.fileName} · ${c.reasons.join(', ')} · ${Object.keys(c.patch).join(',')}`);

if (!APPLY) { console.log('\n(dry-run — להרצה אמיתית: --apply)'); process.exit(0); }

let ok = 0, fail = 0;
for (const c of changes) {
  const { status } = await api({ action: 'update', id: c.id, data: c.patch });
  if (status === 200) ok++; else { fail++; console.log(`✗ נכשל: ${c.fileName}`); }
}
console.log(`בוצע: ${ok} עודכנו, ${fail} נכשלו`);
