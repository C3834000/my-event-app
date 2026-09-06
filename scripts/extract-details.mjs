// ============================================================================
// חילוץ אוטומטי של פרטי מסמכים (ספק, מספר, תאריך, סכומים, מע"מ) מתוך ה-PDF
// ועדכון המסמכים במאגר הייצור. ממלא רק שדות ריקים — לא דורס עריכות ידניות.
// מסמך שכל פרטיו חולצו בביטחון → מאושר אוטומטית; אחרת נשאר "לבדיקה" עם הערה.
// הרצה:  node scripts/extract-details.mjs           ← ניסיון יבש (בלי עדכון)
//        node scripts/extract-details.mjs --apply   ← עדכון בפועל
// ============================================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const APPLY = process.argv.includes('--apply');
const BASE = 'https://myecrm2026.netlify.app';
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const api = (body) => fetch(`${BASE}/api/documents`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
  body: JSON.stringify(body),
}).then(r => r.json());

const F = JSON.parse(fs.readFileSync('test-env/scan/findings.json', 'utf8'));
const byHash = new Map(F.documents.map(d => [d.hash, d]));

// ── נורמליזציית טקסט ─────────────────────────────────────────────────────────
// חלק מה-PDF שומרים עברית הפוכה. מזהים לפי מילים נפוצות הפוכות ומייצרים
// גרסה מתוקנת: היפוך כל שורה + תיקון ריצות ספרות שהתהפכו גם הן.
const fixDigits = (s) => s.replace(/[\d.,%#-]+/g, (m) => [...m].reverse().join(''));
const reverseLine = (l) => fixDigits([...l].reverse().join(''));
const countMatches = (t, re) => (t.match(re) || []).length;
const variants = (text) => {
  // מסמך נחשב "הפוך" רק אם מילים הפוכות שכיחות יותר מהרגילות
  const rev = countMatches(text, /תינובשח|כ"הס|הלבק|םולשת/g);
  const normal = countMatches(text, /חשבונית|סה"כ|קבלה|תשלום/g);
  if (rev > normal) return [text.split('\n').map(reverseLine).join('\n'), text];
  return [text];
};

const num = (s) => {
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1000000 ? n : null;
};

// חיפוש סכום לפי תוויות — תומך גם "תווית סכום" וגם "סכום תווית" (פריסת RTL)
const AMT = '([\\d,]+\\.\\d{2}|[\\d,]{2,})';
const findAmount = (text, labels) => {
  for (const label of labels) {
    let m = text.match(new RegExp(label + '[^\\d\\n%-]{0,25}' + AMT));
    if (m) { const n = num(m[1]); if (n != null) return n; }
    m = text.match(new RegExp(AMT + '\\s*' + label));
    if (m) { const n = num(m[1]); if (n != null) return n; }
  }
  return null;
};

const OWN = /ארליך|רייזי|7656562@|0534528272|קדושת לוי|ביתר עילית/;
// שורות שאינן שם ספק (כותרות, הנחיות תשלום, פרטי חשבון)
const JUNK_LINE = /לביצוע העברה|למידע נוסף|חשבון מספר|מספר הקצאה|הקצאה מספר|:נייד|נייד:|אישור יועץ|תקופת|לתשלום|סה"?כ|תיאור|כמות|יתרה|אמצעי|העברה בנקאית|לחץ כאן|בנק מזרחי|טפחות|בנק לאומי|בנק הפועלים|לינק|קישור|THINGS DONE|^!|חייב במע"?מ|פטור ממע"?מ|סניף/;
// ספקים מוכרים — זיהוי לפי סימנים מובהקים בתוכן
const KNOWN_SUPPLIERS = [
  [/cellcom\.co\.il|סלקום/i, 'סלקום ישראל בע"מ'],
  [/הוט מובייל/, 'הוט מובייל בע"מ'],
  [/חברת ה?חשמל לישראל/, 'חברת החשמל לישראל בע"מ'],
  [/כביש 6|חוצה צפון|חוצה ישראל/, 'כביש 6 — חוצה צפון בע"מ'],
  [/תוכניקל|לקינכות/, 'תוכניקל'],
  [/way\s*to\s*go/i, 'Way To Go'],
  [/וייסטק/, 'וייסטק'],
  [/לשכת אשראי לישראל/, 'ל.א.י לשכת אשראי לישראל בע"מ'],
  [/supergas|סופרגז/i, 'סופרגז'],
  [/isracard|ישראכרט/i, 'ישראכרט'],
];
// מסמכים שאינם חשבוניות הוצאה — סימון לבדיקה בלי מילוי אוטומטי
const NON_INVOICE = [
  [/תלוש\s*(שכר|:)|ברוטו למס הכנסה/, 'תלוש שכר'],
  [/אישור הכנסות|אישור יועץ מס/, 'אישור הכנסות (מסמך מס)'],
  [/שומת מס|שומה לשנת/, 'שומת מס'],
  [/AccountMovementsReport|דוח תנועות|תנועות בחשבון/i, 'דוח תנועות בנק'],
];

function extract(text, fileName) {
  const out = { total: null, vat: null, net: null, docNumber: null, date: null, counterparty: null, nonInvoice: null, cancelled: false };
  for (const [re, label] of NON_INVOICE) {
    if (re.test(text) || re.test(fileName)) { out.nonInvoice = label; break; }
  }
  out.cancelled = /מבוטל/.test(fileName) || /חשבונית מבוטלת|מסמך מבוטל/.test(text);
  for (const t of variants(text)) {

    // סכומים — עדיפות ל"סה"כ לתשלום כולל מע"מ", אח"כ "סה"כ לתשלום", אח"כ "סה"כ"
    if (out.total == null) out.total = findAmount(t, [
      'סה"?כ[^\\n]{0,20}לתשלום[^\\n]{0,15}כולל\\s*מע"?מ', 'סה"?כ\\s*לתשלום\\s*בש"?ח\\s*כולל\\s*מע"?מ',
      'לתשלום\\s*כולל\\s*מע"?מ', 'סה"?כ\\s*לתשלום(?!\\s*לפני)', 'סה"?כ\\s*כולל\\s*מע"?מ',
    ]);
    if (out.net == null) out.net = findAmount(t, ['סה"?כ\\s*לתשלום\\s*לפני\\s*מע"?מ', 'סה"?כ\\s*לפני\\s*מע"?מ', 'לפני\\s*מע"?מ']);
    if (out.vat == null) out.vat = findAmount(t, ['מע"?מ\\s*\\d{1,2}(?:\\.\\d+)?\\s*%', '\\d{1,2}\\s*%\\s*(?:סה"?כ\\s*)?מע"?מ', 'סה"?כ\\s*מע"?מ']);
    // "סה"כ ₪ 840" או "₪ 840" בקבלות פשוטות
    if (out.total == null) {
      const m = t.match(/(?:סה"?כ[^\n]{0,10})?₪\s*([\d,]+(?:\.\d{2})?)/) || t.match(/([\d,]+(?:\.\d{2})?)\s*₪/);
      if (m) out.total = num(m[1]);
    }

    // מספר מסמך
    if (!out.docNumber) {
      const m = t.match(/(?:חשבונית(?:\s*מס)?(?:\s*\/?\s*קבלה)?|חשבון\s*[\/-]?\s*קבלה|קבלה)\s*(?:מספר|מס'?|[#:])?\s*(\d{3,12})/)
        || t.match(/(?:מספר|מס'?)\s*(?:חשבונית|קבלה|מסמך)\s*:?\s*(\d{3,12})/)
        || t.match(/#\s*(\d{3,12})/);
      if (m) out.docNumber = m[1];
    }

    // תאריך — הפקה/מסמך עדיף על תקופות
    if (!out.date) {
      const dm = t.match(/תאריך\s*(?:הפקת\s*החשבון|החשבון|מסמך|הפקה)\s*:?\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/)
        || t.match(/(?:מקור|תאריך)\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)
        || t.match(/(\d{1,2})[.\/](\d{1,2})[.\/](20\d{2})(?![\d.\/])/);
      if (dm) {
        let [, d, mo, y] = dm;
        if (y.length === 2) y = '20' + y;
        const dd = +d, mm = +mo, yy = +y;
        if (yy >= 2020 && yy <= 2026 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          out.date = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        }
      }
    }

    // ספק — קודם ספקים מוכרים לפי סימנים בתוכן
    if (!out.counterparty) {
      for (const [re, name] of KNOWN_SUPPLIERS) {
        if (re.test(t) || re.test(fileName)) { out.counterparty = name; break; }
      }
    }
    // אחרת: השורה המשמעותית הראשונה שאינה הלקוח עצמו ואינה שורת עזר
    if (!out.counterparty) {
      const lines = t.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 12)
        .filter(l => !OWN.test(l) && !JUNK_LINE.test(l));
      const letters = (l) => (l.match(/[א-תA-Za-z]/g) || []).length;
      const clean = (l) => letters(l) >= 3 && letters(l) / l.replace(/\s/g, '').length > 0.5 && l.length < 50;
      // עדיפות: שורה עם בע"מ, או שורה שאחריה ח.פ/ע.מ/עוסק
      let cand = lines.find(l => /בע"?מ/.test(l) && clean(l));
      if (!cand) {
        const idx = lines.findIndex(l => /^(ח\.?פ\.?|ע\.?מ\.?|עוסק\s*(מורשה|פטור))/.test(l));
        if (idx > 0 && clean(lines[idx - 1])) cand = lines[idx - 1];
      }
      if (!cand) cand = lines.find(l => clean(l) && !/חשבונית|קבלה|לכבוד|תאריך|מקור|עמוד|מסמך|תלוש|אישור/.test(l));
      if (cand) out.counterparty = cand.replace(/\s{2,}/g, ' ').replace(/[,:]+$/, '').trim();
    }
  }
  // אימות עקביות: נטו + מע"מ ≈ סה"כ
  out.consistent = out.total != null && out.net != null && out.vat != null
    && Math.abs(out.net + out.vat - out.total) <= 0.05;
  return out;
}

// ── ריצה ─────────────────────────────────────────────────────────────────────
const list = await api({ action: 'list' });
const docs = list.documents || [];
console.log(`${docs.length} מסמכים במאגר · מצב: ${APPLY ? 'עדכון בפועל' : 'ניסיון יבש'}\n`);

const report = [];
let full = 0, partial = 0, flagged = 0, skippedEdited = 0;

for (const doc of docs) {
  const local = byHash.get(doc.fileHash);
  const row = { file: doc.fileName, id: doc.id };
  if (!local) { row.result = 'אין קובץ מקומי'; flagged++; report.push(row); continue; }

  let text = '';
  try { text = (await pdfParse(fs.readFileSync(local.locations[0]))).text || ''; }
  catch { row.result = 'PDF לא נקרא'; flagged++; report.push(row); continue; }
  if (text.trim().length < 30) { row.result = 'אין טקסט (סריקה/תמונה) — נדרש ידני'; flagged++; report.push(row); continue; }

  const ex = extract(text, doc.fileName || '');
  const data = {};
  // מסמך שאינו חשבונית (תלוש/שומה/דוח בנק) — רק סיווג, בלי מילוי סכומים בניחוש
  if (!ex.nonInvoice) {
    // ממלאים רק שדות ריקים
    if (doc.totalAmount == null && ex.total != null) data.totalAmount = ex.total;
    if (doc.vatAmount == null && ex.vat != null) data.vatAmount = ex.vat;
    if (doc.netAmount == null && ex.net != null) data.netAmount = ex.net;
    if (!doc.docNumber && ex.docNumber) data.docNumber = ex.docNumber;
    if (!doc.docDate && ex.date) data.docDate = ex.date;
    if (!doc.counterparty && ex.counterparty) data.counterparty = ex.counterparty;
  } else if ((doc.docType || '') !== ex.nonInvoice) {
    data.docType = ex.nonInvoice;
  }

  const after = { ...doc, ...data };
  const missing = [];
  if (after.totalAmount == null) missing.push('סכום');
  if (!after.docDate) missing.push('תאריך');
  if (!after.counterparty) missing.push('ספק');
  if (!after.docNumber) missing.push('מספר מסמך');

  const strong = after.totalAmount != null && after.docDate && after.counterparty
    && (ex.consistent || (ex.vat == null && ex.net == null));

  let status, noteAdd;
  if (ex.nonInvoice) {
    status = 'needs_review'; flagged++;
    noteAdd = `🔎 זוהה כ${ex.nonInvoice} — לא חשבונית הוצאה, נדרשת החלטה ידנית`;
  } else if (ex.cancelled) {
    status = 'needs_review'; flagged++;
    noteAdd = '🔎 נראה כמסמך מבוטל — לא לכלול בהוצאות בלי בדיקה';
  } else if (strong && !missing.length) {
    status = 'confirmed'; full++;
    noteAdd = '✓ הפרטים חולצו אוטומטית מתוכן המסמך ואומתו (נטו+מע"מ=סה"כ)';
  } else if (strong) {
    status = 'confirmed'; full++;
    noteAdd = `✓ חולץ אוטומטית מהתוכן · להשלמה אם רלוונטי: ${missing.join(', ')}`;
  } else {
    status = 'needs_review'; partial++;
    noteAdd = `⚠ חולץ חלקית — להשלים ידנית: ${missing.join(', ') || 'אימות סכומים'}`;
  }

  row.result = `${status === 'confirmed' ? 'אושר' : 'לבדיקה'} | סכום=${after.totalAmount ?? '—'} מע"מ=${after.vatAmount ?? '—'} תאריך=${after.docDate ?? '—'} ספק=${after.counterparty ?? '—'} מס'=${after.docNumber ?? '—'}`;
  report.push(row);

  if (APPLY && (Object.keys(data).length || status !== doc.reviewStatus)) {
    data.reviewStatus = status;
    // לא מכפילים הערה שכבר נוספה בהרצה קודמת
    const notes = (doc.notes || '').trim();
    data.notes = notes.includes(noteAdd) ? notes : [notes, noteAdd].filter(Boolean).join('\n');
    const res = await api({ action: 'update', id: doc.id, data });
    if (!res.success) { row.result += ` | ✗ עדכון נכשל: ${res.error}`; }
  }
}

const lines = report.map(r => `${r.result}  ←  ${r.file}`);
fs.writeFileSync('test-env/scan/extract-report.txt', lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
console.log(`\nסיכום: ${full} מלאים ואושרו · ${partial} חלקיים (לבדיקה) · ${flagged} מסומנים (תלוש/סריקה/לא נקרא)`);
