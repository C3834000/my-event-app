// ============================================================================
// יצירת רשומות "חסר מסמך" במאגר עבור חיובים עסקיים מדפי האשראי שאין להם חשבונית.
// - ההוצאה נספרת בחישובים (סכום מלא, מע"מ=0 — אין קיזוז מע"מ בלי חשבונית).
// - docType='חסר מסמך' + הערה עם פרטי החיוב, כדי שברור מה צריך להשיג.
// - docNumber ייחודי CC-תאריך-סכום מונע כפילות בהרצה חוזרת.
// - כשמגיעה החשבונית האמיתית: מעלים אותה כרגיל ומארכבים את רשומת ה"חסר".
// הרצה: node scripts/create-missing-placeholders.mjs [--apply]
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const APPLY = process.argv.includes('--apply');
const DIR = 'C:/Users/c3834/Downloads/חשבוניות/פירוט כ אשראי';
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const api = async (body) => {
  const res = await fetch('https://myecrm2026.netlify.app/api/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// ── אותה לוגיקת חילוץ וסיווג כמו cc-crosscheck.mjs ──────────────────────────
const CATEGORIES = [
  'עמותות ותרומות', 'מקצועות חופשיים', 'ביטוח ופיננסים', 'רפואה ובריאות',
  'חינוך ולימודים', 'עירייה וממשלה', 'דלק חשמל וגז', 'מזון ומשקאות', 'רכב ותחבורה',
  'שירותי ייעוץ', 'חשמל ואלקט', 'ספרים ודפוס', 'רשתות שיווק', 'שירותי רכב',
  'פנאי בילוי', 'ציוד ומשרד', 'ריהוט ובית', 'מזון ומשקא', 'רפואה וברי', 'מזון מהיר',
  'עמותות ותר', 'מקצועות חו', 'רכב ותחבור', 'שירותי ייע', 'בתי כלבו',
  'תיירות', 'ביטוח', 'מחשבים', 'תקשורת', 'אופנה', 'שונות', 'שרותים', 'מסעדות',
  'תחבורה', 'אנרגיה', 'מוסדות', 'צרכנות', 'חינוך', 'ופינ',
];
const BUSINESS_MERCHANTS = [
  /google|גוגל/i, /openai|chatgpt/i, /anthropic|claude/i, /cursor/i, /adobe/i,
  /canva/i, /wix/i, /netlify|vercel|supabase/i, /godaddy|namecheap|domain/i,
  /microsoft|office/i, /dropbox/i, /zoom/i, /fiverr|freelancer/i,
  /סלקום/, /הוט\s*מוביי?ל|hot/i, /פרטנר|partner/i, /בזק/, /019|012|013/,
  /כביש\s*6|חוצה/, /וייסטק/, /קליקסי|מסרון|sms/i, /גרין\s*אינווי|greeninvoice|חשבונית ירוקה/i,
  /השבועון|עיתון/, /דפוס|פרינט|גרפציק|גרפיק/, /פיקסל|צילום|עריכה/, /מוזיקה|אולפן|הדרן/,
  /פרסום/, /עורך דין|עו"ד|רו"ח|ייעוץ/, /מרכז המחשב/, /אביב אלנתן/,
];
const BUSINESS_CATEGORIES = ['מחשבים', 'תקשורת', 'ציוד ומשרד', 'ספרים ודפוס', 'מקצועות חופשיים', 'מקצועות חו', 'שירותי ייעוץ', 'שירותי ייע'];
const DONATION = (tx) => /עמותות/.test(tx.category) || /ע"ר|\(ער\)|הצדקה|עמותת/.test(tx.merchant);
const revLine = (s) => [...s].reverse().join('');
const isLatin = (s) => /^[A-Za-z0-9 .*'&\-\/]+$/.test(s.trim()) && /[A-Za-z]/.test(s);

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.toLowerCase().endsWith('.pdf')) files.push(p);
  }
};
walk(DIR);
files.sort((a, b) => (/merged/i.test(a) ? 1 : 0) - (/merged/i.test(b) ? 1 : 0));

const seenHash = new Set(), seenTx = new Set();
const all = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  if (seenHash.has(h)) continue;
  seenHash.add(h);
  let text = '';
  try { text = (await pdfParse(buf)).text || ''; } catch { continue; }
  const card = /עסקי/.test(f) ? 'עסקי' : /פרטי/.test(f) ? 'פרטי' : 'אחר';
  for (const raw of text.split('\n')) {
    const m = raw.trim().match(/^₪\s*([\d,]+\.\d{2})₪\s*([\d,]+\.\d{2})(.*?)(\d{4}\/\d{2}\/\d{2})$/);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/,/g, ''));
    let mid = m[3].replace(/^(לא|כן)/, '').trim()
      .replace(/^(ארצות הברית|בריטניה|אירלנד|גרמניה|הולנד|לוקסמבורג|קפריסין|סינגפור)/, '').trim();
    let category = '', merchant = mid;
    for (const c of CATEGORIES) {
      if (mid.startsWith(c)) { category = c; merchant = mid.slice(c.length).trim(); break; }
    }
    if (isLatin(merchant)) merchant = revLine(merchant);
    const date = revLine(m[4]).split('/').reverse().join('-');
    if (!/^202[3-6]-/.test(date)) continue;
    const k = `${date}|${merchant}|${amount}`;
    if (seenTx.has(k)) continue;
    seenTx.add(k);
    all.push({ date, merchant: merchant.trim(), category, amount, card, file: path.basename(f) });
  }
}
const isBusiness = (tx) =>
  BUSINESS_MERCHANTS.some(re => re.test(tx.merchant)) ||
  (tx.card === 'עסקי' && BUSINESS_CATEGORIES.includes(tx.category));
const business = all.filter(tx => isBusiness(tx) && !DONATION(tx));

// ── מסמכים קיימים ────────────────────────────────────────────────────────────
const { body: listBody } = await api({ action: 'list', limit: 1000 });
const docs = (listBody.documents || []).filter(d => d.direction === 'expense');
const existingNumbers = new Set(docs.map(d => d.docNumber).filter(Boolean));
const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const hasRealDoc = (tx) => docs.some(d =>
  d.docType !== 'חסר מסמך' &&
  d.totalAmount != null && Math.abs(Number(d.totalAmount) - tx.amount) <= 1 &&
  (!d.docDate || dayDiff(d.docDate, tx.date) <= 45)
);

const missing = business.filter(tx => {
  const ccNum = `CC-${tx.date.replaceAll('-', '')}-${tx.amount.toFixed(2)}`;
  return !existingNumbers.has(ccNum) && !hasRealDoc(tx);
});
console.log(`עסקיות: ${business.length} · חסרות מסמך וללא רשומה קיימת: ${missing.length} · סה"כ ₪${missing.reduce((s, t) => s + t.amount, 0).toFixed(2)}`);
for (const tx of missing) console.log(`- ${tx.date} · ₪${tx.amount.toFixed(2)} · ${tx.merchant}`);

if (!APPLY) { console.log('\n(dry-run — להרצה: --apply)'); process.exit(0); }

let ok = 0, fail = 0;
for (const tx of missing) {
  const ccNum = `CC-${tx.date.replaceAll('-', '')}-${tx.amount.toFixed(2)}`;
  const { status, body } = await api({ action: 'create', data: {
    direction: 'expense',
    docType: 'חסר מסמך',
    counterparty: tx.merchant,
    docNumber: ccNum,
    docDate: tx.date,
    totalAmount: tx.amount,
    netAmount: tx.amount, // בלי חשבונית אין קיזוז מע"מ — הכל נרשם כנטו
    vatAmount: 0,
    reviewStatus: 'confirmed',
    notes: `⚠ חסר מסמך — נרשם מדף אשראי כאל (${tx.file}, כרטיס ${tx.card}). יש להשיג חשבונית מהספק; בלי חשבונית אין קיזוז מע"מ. כשהמסמך יגיע — להעלות אותו ולארכב רשומה זו.`,
  }, source: { kind: 'statement', ref: tx.file } });
  if (status === 200) ok++; else { fail++; console.log(`✗ ${tx.merchant} ${tx.date}: ${body.error || status}`); }
}
console.log(`בוצע: ${ok} רשומות "חסר מסמך" נוצרו, ${fail} נכשלו`);
