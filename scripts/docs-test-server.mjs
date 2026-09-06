// ============================================================================
// שרת סביבת הבדיקה של מאגר המסמכים — מקומי לחלוטין, מבודד מהייצור.
// ----------------------------------------------------------------------------
// - מריץ את הפונקציה האמיתית netlify/functions/documents.js (דרך hook שמחליף
//   את supabase-js בתחליף מקומי עמיד: test-env/db.json + test-env/storage/).
// - משרת העלאה/צפייה בקבצים אך ורק דרך כתובות חתומות; גישה ישירה נחסמת.
// - מפתח הגישה DOCS_API_KEY: אקראי, נוצר אוטומטית ונשמר ב-.env.documents-test
//   (קובץ שמוחרג מ-git). לא קשור לסיסמת הייצור.
// - שאר נתיבי /api (חשבונית ירוקה, מיילים וכו') מנוטרלים — 404 מכוון.
//
// הרצה מלאה (שרת + אפליקציה):
//   node --import ./scripts/local-supabase-register.mjs scripts/docs-test-server.mjs
// שרת בלבד (לבדיקות אוטומטיות):
//   node --import ./scripts/local-supabase-register.mjs scripts/docs-test-server.mjs --no-vite
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { acceptSignedUpload, resolveSignedRead } from './local-supabase.mjs';

const ROOT = process.cwd();
const PORT = Number(process.env.DOCS_TEST_PORT || 4000);
const NO_VITE = process.argv.includes('--no-vite');
const MAX_UPLOAD = 25 * 1024 * 1024; // 25MB

// ── מפתח גישה: אקראי, מקומי, לא בגיט, לא קשור לשום סיסמה ────────────────────
const ENV_FILE = path.join(ROOT, '.env.documents-test');
function ensureDocsKey() {
  if (fs.existsSync(ENV_FILE)) {
    const m = fs.readFileSync(ENV_FILE, 'utf8').match(/^DOCS_API_KEY=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(ENV_FILE, `# נוצר אוטומטית על ידי scripts/docs-test-server.mjs — לא נכנס ל-git\nDOCS_API_KEY=${key}\n`, 'utf8');
  return key;
}
const DOCS_KEY = ensureDocsKey();
process.env.DOCS_API_KEY = DOCS_KEY;

// ערכי דמה כדי שהפונקציה תעבור את בדיקת הקונפיגורציה; התחליף המקומי מתעלם מהם.
// בכוונה לא נטען שום קובץ ‎.env — אין דרך שמפתחות ייצור יגיעו לתהליך הזה.
process.env.VITE_SUPABASE_URL = 'http://local-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-service-key-not-a-real-secret';
process.env.DOCS_TEST_BASE_URL = `http://localhost:${PORT}`;

const { handler } = await import('../netlify/functions/documents.js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-docs-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('גדול מדי')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { ...CORS, ...headers });
    res.end(body);
  };
  const sendJson = (status, obj) => send(status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

  try {
    if (req.method === 'OPTIONS') return send(204, '');

    // ── הפונקציה האמיתית ────────────────────────────────────────────────
    if (url.pathname === '/api/documents' && req.method === 'POST') {
      const body = await readBody(req, 2 * 1024 * 1024);
      const result = await handler({
        httpMethod: 'POST',
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
        body: body.toString('utf8'),
      });
      return send(result.statusCode, result.body, { ...result.headers, 'Content-Type': 'application/json; charset=utf-8' });
    }

    // ── שאר ה-API מנוטרל בסביבת הבדיקה (אין ח"י, אין מיילים, אין DB ייצור) ──
    if (url.pathname.startsWith('/api/')) {
      return sendJson(404, { success: false, error: 'נתיב זה מנוטרל בסביבת הבדיקה המבודדת' });
    }

    // ── העלאה דרך כתובת חתומה בלבד ──────────────────────────────────────
    const upMatch = url.pathname.match(/^\/storage\/upload\/([a-f0-9]{48})$/);
    if (upMatch && req.method === 'PUT') {
      const buffer = await readBody(req);
      const r = acceptSignedUpload(upMatch[1], buffer, req.headers['content-type']);
      if (!r.ok) return sendJson(r.status, { error: r.error });
      return sendJson(200, { ok: true });
    }

    // ── צפייה דרך כתובת חתומה בלבד ──────────────────────────────────────
    const rdMatch = url.pathname.match(/^\/storage\/signed\/([a-f0-9]{48})$/);
    if (rdMatch && req.method === 'GET') {
      const r = resolveSignedRead(rdMatch[1]);
      if (!r.ok) return sendJson(r.status, { error: r.error });
      res.writeHead(200, { ...CORS, 'Content-Type': r.mime, 'Content-Disposition': 'inline' });
      fs.createReadStream(r.file).pipe(res);
      return;
    }

    // ── כל גישה אחרת לאחסון — חסומה (bucket פרטי) ───────────────────────
    if (url.pathname.startsWith('/storage/')) {
      return sendJson(403, { error: 'גישה ישירה לאחסון חסומה — נדרשת כתובת חתומה' });
    }

    if (url.pathname === '/health') return sendJson(200, { ok: true, env: 'docs-test' });

    return sendJson(404, { error: 'not found' });
  } catch (e) {
    return sendJson(500, { error: e.message || String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`[docs-test] שרת הבדיקה רץ: http://localhost:${PORT} (מבודד — ללא ייצור, ללא ח"י, ללא מיילים)`);
  console.log(`[docs-test] נתונים: test-env/db.json · קבצים: test-env/storage/`);

  if (!NO_VITE) {
    // האפליקציה עצמה — vite על פורט 3000, עם מפתח הגישה מוזרק ללקוח.
    // process env גובר על קבצי .env של Vite, לכן אפשר לנטרל גם משתני ייצור.
    const vite = spawn('npx.cmd', ['vite'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        VITE_DOCS_API_KEY: DOCS_KEY,
        // נטרול מוחלט של מפתחות ייצור בצד הלקוח (גוברים על .env.local)
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      },
    });
    const stop = () => { try { vite.kill(); } catch { /* ignore */ } process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    vite.on('exit', () => process.exit(0));
    console.log('[docs-test] פותח את האפליקציה: http://localhost:3000/#/documents');
  }
});
