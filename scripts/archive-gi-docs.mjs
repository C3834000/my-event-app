// ============================================================================
// ארכוב מסמכים במאגר שהם מסמכי חשבונית ירוקה שהופקו על ידך (הכנסות ללקוחות) —
// אלה לא הוצאות ולא צריכים להיות במאגר. זיהוי:
//   א. מספר המסמך קיים ברשימת המסמכים שלך בחשבונית ירוקה (2025-2026)
//   ב. היוריסטיקה: המסמך כולל את פרטי חשבון הבנק שלך להעברה (מזרחי/סניף 458)
//      יחד עם "לכבוד" של לקוח שאינו אתה — מסמך שאתה הפקת
// הרצה:  node scripts/archive-gi-docs.mjs           ← ניסיון יבש
//        node scripts/archive-gi-docs.mjs --apply   ← ארכוב בפועל
// ============================================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const APPLY = process.argv.includes('--apply');
const BASE = 'https://myecrm2026.netlify.app';
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const api = (path, body) => fetch(`${BASE}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
  body: JSON.stringify(body),
}).then(r => r.json());

const F = JSON.parse(fs.readFileSync('test-env/scan/findings.json', 'utf8'));
const byHash = new Map(F.documents.map(d => [d.hash, d]));

// ── רשימת מספרי המסמכים שלך בחשבונית ירוקה ──────────────────────────────────
const giNumbers = new Set();
for (const year of ['2025', '2026']) {
  const res = await fetch(`${BASE}/api/green-invoice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'searchDocuments', fromDate: `${year}-01-01`, toDate: `${year}-12-31` }),
  }).then(r => r.json());
  for (const d of res.documents || []) {
    if (d.number != null) giNumbers.add(String(d.number).trim());
  }
}
console.log(`מסמכי חשבונית ירוקה שנמצאו (2025-2026): ${giNumbers.size} מספרים\n`);

// ── בדיקת כל מסמכי המאגר ─────────────────────────────────────────────────────
const list = await api('/api/documents', { action: 'list' });
const docs = list.documents || [];
let archived = 0;

for (const doc of docs) {
  let reason = null;
  if (doc.docNumber && giNumbers.has(String(doc.docNumber).trim())) {
    reason = `מספר המסמך ${doc.docNumber} קיים בחשבונית ירוקה שלך`;
  } else {
    // היוריסטיקה לפי תוכן — תופסת גם מסמכים מבוטלים שלא חוזרים מה-API
    const local = byHash.get(doc.fileHash);
    if (local) {
      try {
        const text = (await pdfParse(fs.readFileSync(local.locations[0]))).text || '';
        // סימנים חד-משמעיים: העסק שלך כמפיק, או חשבון הבנק שלך כמוטב התשלום
        const issuedByMe = /הקליכיף\s*\/?\s*ארליך|ע"ש ארליך|מוטב:\s*ארליך/.test(text)
          || (/לביצוע העברה/.test(text) && /מזרחי|טפחות/.test(text) && /458/.test(text) && /ארליך/.test(text));
        if (issuedByMe) reason = 'הופק על ידך (העסק שלך מופיע כמפיק / חשבון הבנק שלך כמוטב)';
      } catch { /* לא נקרא — לא נוגעים */ }
    }
  }
  if (!reason) continue;

  console.log(`→ ${doc.fileName} | ספק=${doc.counterparty || '—'} | סכום=${doc.totalAmount ?? '—'} | ${reason}`);
  archived++;
  if (APPLY) {
    await api('/api/documents', { action: 'update', id: doc.id, data: {
      notes: [(doc.notes || '').trim(), `📤 הועבר לארכיון: מסמך חשבונית ירוקה שהופק על ידך (הכנסה, לא הוצאה). ${reason}`].filter(Boolean).join('\n'),
    } });
    await api('/api/documents', { action: 'archive', id: doc.id });
  }
}

console.log(`\n${APPLY ? 'הועברו לארכיון' : 'מועמדים לארכוב (ניסיון יבש)'}: ${archived} מתוך ${docs.length}`);
