// סימון מסמכי חיים/חוה שפירא כ"מעקב" (tracking) — כספים שנגבו אצלם בגין
// מוצרי קליקריים; לא הוצאה של העסק, לא נספר בחישובי מס.
// דורש שמיגרציה 002 כבר רצה. הרצה: node scripts/mark-tracking.mjs [--apply]
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const api = async (body) => {
  const res = await fetch('https://myecrm2026.netlify.app/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-docs-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const { body: listBody } = await api({ action: 'list', limit: 1000 });
const docs = listBody.documents || [];
const targets = docs.filter(d =>
  d.direction !== 'tracking' &&
  /ח(יים|וה) שפירא/.test(d.counterparty || '')
);
console.log(`מסמכי שפירא לסימון כמעקב: ${targets.length}`);
for (const d of targets) console.log(`- ${d.fileName} · ${d.counterparty} · ${d.docDate || 'ללא תאריך'} · ${d.totalAmount ?? '—'}`);

if (!APPLY) { console.log('(dry-run — להרצה: --apply)'); process.exit(0); }

let ok = 0, fail = 0;
for (const d of targets) {
  const marker = 'מעקב: התקבל אצל שפירא בגין מוצרי קליקריים — לא הוצאה של העסק';
  const notes = (d.notes || '').includes(marker) ? d.notes : [(d.notes || ''), marker].filter(Boolean).join('\n');
  const { status, body } = await api({ action: 'update', id: d.id, data: { direction: 'tracking', notes } });
  if (status === 200) ok++; else { fail++; console.log(`✗ ${d.fileName}: ${body.error || status}`); }
}
console.log(`בוצע: ${ok} סומנו כמעקב, ${fail} נכשלו`);
