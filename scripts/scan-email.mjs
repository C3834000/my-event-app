// ============================================================================
// סריקת תיבות מייל (IMAP) לאיתור חשבוניות/קבלות — קריאה בלבד, לא מוחק ולא מסמן.
// מוריד קבצי PDF מצורפים ממיילים רלוונטיים (2025-2026) לתיקייה מקומית:
//   C:\Users\c3834\Downloads\חשבוניות\מייל\<חשבון>\
// משם צינור הייבוא הקיים (collect-invoices.ps1) מכניס אותם למאגר בלי כפילויות
// (לפי hash), כך שמסמך שכבר נסרק מהתיקיות לא ייכנס שוב.
//
// הגדרה: קובץ ‎.env.email‎ בשורש הפרויקט (לא נכנס ל-Git), שורה לכל חשבון:
//   ACCOUNT=כתובת@gmail.com:סיסמת-אפליקציה-בת-16-תווים
// סיסמת אפליקציה מייצרים ב: https://myaccount.google.com/apppasswords
// הרצה: node scripts/scan-email.mjs
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { ImapFlow } from 'imapflow';

const OUT_ROOT = 'C:/Users/c3834/Downloads/חשבוניות/מייל';
const SINCE = new Date('2025-01-01');
const KEYWORD = /חשבונית|קבלה|זיכוי|תרומה|דרישת תשלום|invoice|receipt|billing|payment confirmation|donation/i;
// שולחים מוכרים שתמיד מעניינים גם בלי מילת מפתח בנושא
const KNOWN_SENDERS = /greeninvoice|icount|ezcount|invoice4u|sumit|cal-online|max\.co\.il|isracard|meshulam|payplus|paypal|google|openai|anthropic|cursor|netlify|wix|godaddy|012|013|019|hot\.net|partner|cellcom|bezeq|6\.co\.il|kvish6/i;

const envPath = '.env.email';
if (!fs.existsSync(envPath)) {
  console.log('חסר קובץ .env.email — צור אותו עם שורות ACCOUNT=כתובת:סיסמת-אפליקציה');
  process.exit(1);
}
const accounts = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  .map(l => l.match(/^ACCOUNT=([^:]+):(.+)$/)).filter(Boolean)
  .map(m => ({ user: m[1].trim(), pass: m[2].trim() }));
if (!accounts.length) { console.log('לא נמצאו חשבונות ב-.env.email'); process.exit(1); }

const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
let totalSaved = 0, totalSkipped = 0;
const log = [];

for (const acc of accounts) {
  console.log(`\n=== ${acc.user} ===`);
  const outDir = path.join(OUT_ROOT, safe(acc.user));
  fs.mkdirSync(outDir, { recursive: true });
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: acc.user, pass: acc.pass }, logger: false,
  });
  try {
    await client.connect();
  } catch (e) {
    console.log(`✗ התחברות נכשלה: ${e.message} — בדוק את סיסמת האפליקציה`);
    log.push(`${acc.user}: התחברות נכשלה — ${e.message}`);
    continue;
  }
  // "[Gmail]/All Mail" מכסה גם ארכיון; נופל חזרה ל-INBOX אם לא קיים
  let box = '[Gmail]/All Mail';
  try { await client.mailboxOpen(box, { readOnly: true }); }
  catch {
    const list = await client.list();
    const all = list.find(b => b.specialUse === '\\All');
    box = all ? all.path : 'INBOX';
    await client.mailboxOpen(box, { readOnly: true });
  }
  console.log(`תיבה: ${box}`);
  const uids = await client.search({ since: SINCE }, { uid: true });
  console.log(`מיילים מאז 2025: ${uids.length}`);
  let saved = 0, checked = 0;
  for await (const msg of client.fetch(uids, { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
    checked++;
    if (checked % 500 === 0) console.log(`  ...נבדקו ${checked}`);
    const subj = msg.envelope?.subject || '';
    const from = (msg.envelope?.from || []).map(a => `${a.name || ''} ${a.address || ''}`).join(' ');
    // איסוף חלקי PDF מצורפים מתוך מבנה ההודעה
    const pdfParts = [];
    const walkParts = (node) => {
      if (!node) return;
      const isPdf = /pdf/i.test(`${node.type || ''}`) ||
        /\.pdf$/i.test(node.dispositionParameters?.filename || node.parameters?.name || '');
      if (isPdf && node.part) pdfParts.push(node);
      (node.childNodes || []).forEach(walkParts);
    };
    walkParts(msg.bodyStructure);
    if (!pdfParts.length) continue;
    const fileNames = pdfParts.map(p => p.dispositionParameters?.filename || p.parameters?.name || '').join(' ');
    const relevant = KEYWORD.test(subj) || KEYWORD.test(fileNames) || KNOWN_SENDERS.test(from);
    if (!relevant) { totalSkipped++; continue; }
    const dateStr = (msg.envelope?.date ? new Date(msg.envelope.date) : new Date()).toISOString().slice(0, 10);
    for (const part of pdfParts) {
      const origName = part.dispositionParameters?.filename || part.parameters?.name || 'attachment.pdf';
      const fname = `${dateStr}_${safe(msg.envelope?.from?.[0]?.address || 'unknown')}_${safe(origName)}`;
      const dest = path.join(outDir, fname.endsWith('.pdf') ? fname : fname + '.pdf');
      if (fs.existsSync(dest)) continue;
      try {
        const { content } = await client.download(msg.uid, part.part, { uid: true });
        const chunks = [];
        for await (const c of content) chunks.push(c);
        fs.writeFileSync(dest, Buffer.concat(chunks));
        saved++; totalSaved++;
      } catch (e) {
        log.push(`${acc.user}: הורדה נכשלה ${origName} — ${e.message}`);
      }
    }
  }
  console.log(`נשמרו ${saved} קבצים ל-${outDir}`);
  log.push(`${acc.user}: נבדקו ${checked} מיילים, נשמרו ${saved} קבצי PDF`);
  await client.logout().catch(() => {});
}

fs.mkdirSync('test-env/scan', { recursive: true });
fs.writeFileSync('test-env/scan/email-scan-log.txt', log.join('\n') + `\n\nסה"כ נשמרו: ${totalSaved}, דולגו (לא רלוונטי): ${totalSkipped}\n`);
console.log(`\nסה"כ נשמרו ${totalSaved} קבצים. הצעד הבא: scripts/collect-invoices.ps1 לייבוא למאגר.`);
