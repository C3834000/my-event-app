// ============================================================================
// הצלבת דפי פירוט כרטיס אשראי (כאל) מול מאגר המסמכים:
// 1. מחלץ את כל העסקאות מדפי הפירוט (תיקיית "פירוט כ אשראי").
// 2. מסווג בתי עסק עסקיים (ספקים מוכרים/קטגוריות עסקיות).
// 3. לכל חיוב עסקי — מחפש מסמך תואם במאגר (סכום ±1 ₪, תאריך ±45 יום).
// 4. מפיק דוח: אילו חיובים מגובים במסמך ואילו חשבוניות חסרות וצריך לאתר.
// קריאה בלבד — לא משנה קבצים ולא את המאגר.
// הרצה: node scripts/cc-crosscheck.mjs
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const DIR = 'C:/Users/c3834/Downloads/חשבוניות/פירוט כ אשראי';
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();

// קטגוריות ענף כפי שמופיעות בדפי כאל — לפיצול קטגוריה/שם בית עסק.
// חלקן נחתכות בטקסט (למשל "רכב ותחבור") — הארוכות קודם.
const CATEGORIES = [
  'עמותות ותרומות', 'מקצועות חופשיים', 'ביטוח ופיננסים', 'רפואה ובריאות',
  'חינוך ולימודים', 'עירייה וממשלה', 'דלק חשמל וגז', 'מזון ומשקאות', 'רכב ותחבורה',
  'שירותי ייעוץ', 'חשמל ואלקט', 'ספרים ודפוס', 'רשתות שיווק', 'שירותי רכב',
  'פנאי בילוי', 'ציוד ומשרד', 'ריהוט ובית', 'מזון ומשקא', 'רפואה וברי', 'מזון מהיר',
  'עמותות ותר', 'מקצועות חו', 'רכב ותחבור', 'שירותי ייע', 'בתי כלבו',
  'תיירות', 'ביטוח', 'מחשבים', 'תקשורת', 'אופנה', 'שונות', 'שרותים', 'מסעדות',
  'תחבורה', 'אנרגיה', 'מוסדות', 'צרכנות', 'חינוך', 'ופינ',
];

// בתי עסק עסקיים מובהקים (ספקי העסק) — לפי מה שמוכר מהמאגר ומהפעילות
const BUSINESS_MERCHANTS = [
  /google|גוגל/i, /openai|chatgpt/i, /anthropic|claude/i, /cursor/i, /adobe/i,
  /canva/i, /wix/i, /netlify|vercel|supabase/i, /godaddy|namecheap|domain/i,
  /microsoft|office/i, /dropbox/i, /zoom/i, /fiverr|freelancer/i,
  /סלקום/, /הוט\s*מוביי?ל|hot/i, /פרטנר|partner/i, /בזק/, /019|012|013/,
  /כביש\s*6|חוצה/, /וייסטק/, /קליקסי|מסרון|sms/i, /גרין\s*אינווי|greeninvoice|חשבונית ירוקה/i,
  /השבועון|עיתון/, /דפוס|פרינט|גרפציק|גרפיק/, /פיקסל|צילום|עריכה/, /מוזיקה|אולפן|הדרן/,
  /פרסום/, /עורך דין|עו"ד|רו"ח|ייעוץ/, /מרכז המחשב/, /אביב אלנתן/,
];
// קטגוריות שכמעט תמיד עסקיות אצל עסק דיגיטלי
const BUSINESS_CATEGORIES = ['מחשבים', 'תקשורת', 'ציוד ומשרד', 'ספרים ודפוס', 'מקצועות חופשיים', 'מקצועות חו', 'שירותי ייעוץ', 'שירותי ייע'];
// תרומות — לא הוצאה עסקית אבל מזכות ב-35% זיכוי מס; נאספות בנפרד
const DONATION = (tx) => /עמותות/.test(tx.category) || /ע"ר|\(ער\)|הצדקה|עמותת/.test(tx.merchant);

const revLine = (s) => [...s].reverse().join('');
const revDate = (s) => revLine(s); // 3202/21/91 → 19/12/2023
const isLatin = (s) => /^[A-Za-z0-9 .*'&\-\/]+$/.test(s.trim()) && /[A-Za-z]/.test(s);

function parseStatement(text) {
  const txs = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    // שורת עסקה: ₪ סכום-חיוב ₪ סכום-עסקה ... תאריך-הפוך בסוף
    const m = line.match(/^₪\s*([\d,]+\.\d{2})₪\s*([\d,]+\.\d{2})(.*?)(\d{4}\/\d{2}\/\d{2})$/);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/,/g, ''));
    let middle = m[3].replace(/^(לא|כן)/, '').trim();
    // הסרת שם מדינה נפוץ בעסקות חו"ל
    middle = middle.replace(/^(ארצות הברית|בריטניה|אירלנד|גרמניה|הולנד|לוקסמבורג|קפריסין|סינגפור)/, '').trim();
    let category = '', merchant = middle;
    for (const c of CATEGORIES) {
      if (middle.startsWith(c)) { category = c; merchant = middle.slice(c.length).trim(); break; }
    }
    // שמות באנגלית מגיעים הפוכים (EGAROTS ELGOOG → GOOGLE STORAGE)
    if (isLatin(merchant)) merchant = revLine(merchant);
    const [dd, mm, yyyy] = revDate(m[4]).split('/');
    const date = `${yyyy}-${mm}-${dd}`;
    if (!/^20(2[3-6])-/.test(date)) continue;
    txs.push({ date, merchant: merchant.trim(), category, amount });
  }
  return txs;
}

// ── איסוף עסקאות מכל הדפים (עם דה-דופליקציה של קבצים זהים ושורות זהות) ──────
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.toLowerCase().endsWith('.pdf')) files.push(p);
  }
};
walk(DIR);
// דפי החודש הבודדים קודם (עם שיוך עסקי/פרטי נכון); הקובץ הממוזג אחרון —
// אחרת כל העסקאות משויכות אליו והשיוך לכרטיס הולך לאיבוד
files.sort((a, b) => (/merged/i.test(a) ? 1 : 0) - (/merged/i.test(b) ? 1 : 0));

const seenHash = new Set();
const seenTx = new Set();
const all = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  if (seenHash.has(h)) continue;
  seenHash.add(h);
  let text = '';
  try { text = (await pdfParse(buf)).text || ''; } catch { continue; }
  const card = /עסקי/.test(f) ? 'עסקי' : /פרטי/.test(f) ? 'פרטי' : 'אחר';
  for (const tx of parseStatement(text)) {
    const k = `${tx.date}|${tx.merchant}|${tx.amount}`;
    if (seenTx.has(k)) continue; // אותה עסקה בשני עותקי דף
    seenTx.add(k);
    all.push({ ...tx, card });
  }
}
console.log(`נמצאו ${all.length} עסקאות ייחודיות מ-${seenHash.size} דפי פירוט`);

// ── סיווג עסקי ───────────────────────────────────────────────────────────────
const isBusiness = (tx) =>
  BUSINESS_MERCHANTS.some(re => re.test(tx.merchant)) ||
  (tx.card === 'עסקי' && BUSINESS_CATEGORIES.includes(tx.category));
const donations = all.filter(DONATION);
const business = all.filter(tx => isBusiness(tx) && !DONATION(tx));

// ── מסמכי המאגר ─────────────────────────────────────────────────────────────
const res = await fetch('https://myecrm2026.netlify.app/api/documents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
  body: JSON.stringify({ action: 'list', limit: 1000 }),
});
const docs = ((await res.json()).documents || []).filter(d => d.direction === 'expense');
console.log(`${docs.length} מסמכי הוצאה במאגר להצלבה`);

const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const matchDoc = (tx) => docs.find(d =>
  d.totalAmount != null && Math.abs(Number(d.totalAmount) - tx.amount) <= 1 &&
  (!d.docDate || dayDiff(d.docDate, tx.date) <= 45)
);

// ── דוח ──────────────────────────────────────────────────────────────────────
const byMerchant = new Map();
for (const tx of business) {
  const doc = matchDoc(tx);
  const k = tx.merchant || '(ללא שם)';
  if (!byMerchant.has(k)) byMerchant.set(k, { txs: 0, total: 0, matched: 0, missing: [] });
  const e = byMerchant.get(k);
  e.txs++; e.total += tx.amount;
  if (doc) e.matched++;
  else e.missing.push(`${tx.date} · ₪${tx.amount.toFixed(2)}${tx.card === 'פרטי' ? ' (כרטיס פרטי)' : ''}`);
}

const rows = [...byMerchant.entries()].sort((a, b) => b[1].total - a[1].total);
const out = [`# הצלבת אשראי מול מאגר מסמכים — ${new Date().toLocaleString('he-IL')}`, '',
  `סה"כ עסקאות בדפים: ${all.length} · מסווגות כעסקיות: ${business.length}`, ''];
let missingTotal = 0, missingCount = 0;
for (const [merchant, e] of rows) {
  const missSum = e.missing.length ? e.missing.reduce((s, l) => s + parseFloat(l.split('₪')[1]), 0) : 0;
  missingTotal += missSum; missingCount += e.missing.length;
  out.push(`## ${merchant} — ${e.txs} חיובים · ₪${e.total.toFixed(2)} · מגובים במסמך: ${e.matched} · חסרים: ${e.missing.length}`);
  for (const l of e.missing) out.push(`  - ✗ ${l}`);
  out.push('');
}
out.unshift(`**חשבוניות חסרות: ${missingCount} חיובים בסך ₪${missingTotal.toFixed(2)}**`, '');

// ── תרומות (בנפרד — מזכות זיכוי מס 35%, נדרשות קבלות עם סעיף 46) ─────────────
out.push('', '# תרומות בכרטיסי האשראי (לזיכוי מס — לוודא קבלות סעיף 46)', '');
const donByYear = new Map();
for (const tx of donations) {
  const y = tx.date.slice(0, 4);
  donByYear.set(y, (donByYear.get(y) || 0) + tx.amount);
  out.push(`- ${tx.date} · ₪${tx.amount.toFixed(2)} · ${tx.merchant}${matchDoc(tx) ? ' · ✓ יש מסמך' : ' · ✗ אין קבלה במאגר'}`);
}
out.push('', 'סה"כ תרומות לפי שנה: ' + [...donByYear.entries()].sort().map(([y, v]) => `${y}: ₪${Math.round(v)}`).join(' · '));
fs.writeFileSync('test-env/scan/cc-report.md', out.join('\n'), 'utf8');
console.log(out.slice(0, 80).join('\n'));
console.log(`\nהדוח המלא: test-env/scan/cc-report.md`);
