// בדיקות עשן לייצור: הרשאות, רשימה, העלאה מלאה, כפילות, גישה לקובץ
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = 'https://myecrm2026.netlify.app';
const KEY = fs.readFileSync('.env.documents-prod', 'utf8').match(/^DOCS_API_KEY=(.+)$/m)[1].trim();
const call = (body, key = KEY) => fetch(`${BASE}/api/documents`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(key ? { 'x-docs-key': key } : {}) },
  body: JSON.stringify(body),
}).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`); };

// 1) בלי מפתח → 401
let r = await call({ action: 'list' }, null);
t('בלי מפתח → 401', r.status === 401, `status=${r.status}`);

// 2) מפתח שגוי → 401
r = await call({ action: 'list' }, 'wrong-key-123');
t('מפתח שגוי → 401', r.status === 401, `status=${r.status}`);

// 3) רשימה עם מפתח → 200
r = await call({ action: 'list' });
t('רשימה עם מפתח → 200', r.status === 200, `status=${r.status}, docs=${r.json?.documents?.length}`);

// 4) העלאה מלאה של קובץ בדיקה
const content = Buffer.from(`בדיקת ייצור ${Date.now()}`);
const hash = crypto.createHash('sha256').update(content).digest('hex');
r = await call({ action: 'initUpload', fileHash: hash, fileName: 'prod-smoke-test.txt' });
t('initUpload → 200', r.status === 200 && r.json?.uploadUrl, `status=${r.status}, err=${r.json?.error || ''}`);
const { uploadUrl, path: storagePath } = r.json || {};

let up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: content });
t('PUT לאחסון → 200', up.status === 200, `status=${up.status}`);

r = await call({ action: 'create', data: { direction: 'expense', reviewStatus: 'needs_review', counterparty: 'בדיקת עשן', fileHash: hash, fileName: 'prod-smoke-test.txt', filePath: storagePath, fileMime: 'text/plain' }, source: { kind: 'manual', ref: 'smoke-test' } });
t('create → 200', r.status === 200 && r.json?.document?.id, `status=${r.status}, err=${r.json?.error || ''}`);
const docId = r.json?.document?.id;

// 5) העלאה חוזרת של אותו קובץ → duplicate
r = await call({ action: 'initUpload', fileHash: hash, fileName: 'prod-smoke-test.txt' });
t('העלאה חוזרת → זוהה כקיים', r.status === 200 && r.json?.duplicate === true, `status=${r.status}, dup=${r.json?.duplicate}`);

// 6) fileUrl + קריאת התוכן
r = await call({ action: 'fileUrl', id: docId });
t('fileUrl → 200', r.status === 200 && r.json?.url, `status=${r.status}, err=${r.json?.error || ''}`);
if (r.json?.url) {
  const file = await fetch(r.json.url);
  const text = await file.text();
  t('קריאת הקובץ מהאחסון', file.status === 200 && text.includes('בדיקת ייצור'), `status=${file.status}`);
}

// 7) גישה ישירה לאחסון בלי חתימה → חסום
const direct = await fetch(`https://nzlrnkzbgrnawnggnsul.supabase.co/storage/v1/object/documents/${storagePath}`);
t('גישה ישירה לקובץ פרטי → חסומה', direct.status === 400 || direct.status === 401 || direct.status === 403 || direct.status === 404, `status=${direct.status}`);

// 8) עריכה
r = await call({ action: 'update', id: docId, data: { totalAmount: 123.45, notes: 'בדיקה' } });
t('update → 200', r.status === 200 && r.json?.document?.totalAmount == 123.45, `status=${r.status}`);

// 9) ארכוב מסמך הבדיקה (ניקוי)
r = await call({ action: 'archive', id: docId });
t('archive → 200', r.status === 200, `status=${r.status}, err=${r.json?.error || ''}`);
r = await call({ action: 'list' });
const stillThere = (r.json?.documents || []).some(d => d.id === docId);
t('מסמך בארכיון לא ברשימה הרגילה', !stillThere);

console.log(`\nסה"כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
