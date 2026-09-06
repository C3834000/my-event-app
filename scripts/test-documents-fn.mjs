// בדיקת עשן מקומית לפונקציית documents — נתיבי אימות בלבד, ללא DB.
import { handler } from '../netlify/functions/documents.js';

const call = (body, headers = {}) =>
  handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) });

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}`); }
};

// 1) בלי DOCS_API_KEY בסביבה → 503 (נעול כברירת מחדל)
delete process.env.DOCS_API_KEY;
let r = await call({ action: 'list' });
check('ללא env DOCS_API_KEY → 503', r.statusCode === 503);

// 2) עם env אבל בלי כותרת → 401
process.env.DOCS_API_KEY = 'test-secret-123';
r = await call({ action: 'list' });
check('בלי כותרת x-docs-key → 401', r.statusCode === 401);

// 3) כותרת שגויה → 401
r = await call({ action: 'list' }, { 'x-docs-key': 'wrong' });
check('מפתח שגוי → 401', r.statusCode === 401);

// 4) מפתח נכון אבל בלי SUPABASE_SERVICE_ROLE_KEY → 503 (לא נופל ל-anon)
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
r = await call({ action: 'list' }, { 'x-docs-key': 'test-secret-123' });
check('בלי מפתח service → 503', r.statusCode === 503);

// 5) hash לא תקין נחסם לפני כל גישה ל-DB
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
r = await call({ action: 'initUpload', fileHash: 'not-a-hash' }, { 'x-docs-key': 'test-secret-123' });
check('hash לא תקין → 400', r.statusCode === 400);

// 6) create בלי direction → 400
r = await call({ action: 'create', data: { counterparty: 'x' } }, { 'x-docs-key': 'test-secret-123' });
check('create בלי direction → 400', r.statusCode === 400);

// 7) פעולה לא מוכרת → 400
r = await call({ action: 'nope' }, { 'x-docs-key': 'test-secret-123' });
check('פעולה לא מוכרת → 400', r.statusCode === 400);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
