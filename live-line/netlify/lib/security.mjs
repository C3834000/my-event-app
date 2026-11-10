// שכבת אבטחה: סיסמה (scrypt), עוגיית סשן חתומה, הגנת CSRF, זיהוי IP מוצפן
import crypto from 'node:crypto';
import { verifyTotp } from './totp.mjs';

const COOKIE = '__Host-ll_session';
const SESSION_HOURS = 8;

function env(name) {
  const v = process.env[name];
  return v == null ? '' : String(v);
}

export function isDevMode() {
  return env('LL_DEV_MODE') === '1';
}

// ---------- סיסמה ----------
// פורמט: scrypt$N$r$p$salt(base64)$hash(base64) — נוצר ע"י scripts/setup-admin.mjs
export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(String(password), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const got = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export function checkAdminCredentials(password, totpCode) {
  const hash = env('LL_ADMIN_PASSWORD_HASH');
  const totpSecret = env('LL_TOTP_SECRET');
  if (!hash || !totpSecret) return { ok: false, reason: 'server_not_configured' };
  const passOk = verifyPassword(password, hash);
  const totpOk = verifyTotp(totpSecret, totpCode);
  // תמיד מחשבים את שתי הבדיקות כדי לא לחשוף איזו מהן נכשלה
  return { ok: passOk && totpOk, reason: passOk && totpOk ? null : 'bad_credentials' };
}

// ---------- סשן ----------
function sessionKey() {
  const s = env('LL_SESSION_SECRET');
  if (s.length < 32) throw new Error('LL_SESSION_SECRET missing or too short');
  return s;
}

function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', sessionKey()).update(data).digest('base64url');
}

export function createSessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + SESSION_HOURS * 3600, v: env('LL_SESSION_VERSION') || '1', n: b64u(crypto.randomBytes(9)) };
  const data = b64u(JSON.stringify(payload));
  const value = `${data}.${sign(data)}`;
  return cookieHeader(value, SESSION_HOURS * 3600);
}

export function clearSessionCookie() {
  return cookieHeader('', 0);
}

function cookieHeader(value, maxAge) {
  // בפיתוח מקומי (http) אי אפשר להשתמש ב-Secure/__Host-
  if (isDevMode()) return `ll_session_dev=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

export function getSession(req) {
  const raw = readCookie(req, isDevMode() ? 'll_session_dev' : COOKIE);
  if (!raw || !raw.includes('.')) return null;
  const [data, sig] = raw.split('.');
  let expected;
  try { expected = sign(data); } catch { return null; }
  const a = Buffer.from(sig || ''), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (String(payload.v) !== (env('LL_SESSION_VERSION') || '1')) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- CSRF ----------
// בקשות משנות-מצב חייבות: כותרת x-ll-csrf, ו-Origin זהה לכתובת האתר (אם ידועה)
export function checkCsrf(req) {
  if (req.headers.get('x-ll-csrf') !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true; // דפדפנים מודרניים שולחים Origin ב-POST; כלי שרת לא — אבל הם גם לא שולחים עוגייה
  const allowed = [env('URL'), env('DEPLOY_PRIME_URL'), env('LL_SITE_URL')].filter(Boolean).map((u) => u.replace(/\/$/, ''));
  if (isDevMode()) allowed.push('http://localhost:5174', 'http://127.0.0.1:5174');
  if (allowed.length === 0) return true;
  return allowed.includes(origin.replace(/\/$/, ''));
}

// ---------- IP ----------
// לא שומרים כתובות IP גלויות — רק גיבוב עם מלח סודי
export function ipHash(ip) {
  const salt = env('LL_SESSION_SECRET') || 'dev';
  return crypto.createHmac('sha256', salt).update(String(ip || 'unknown')).digest('hex').slice(0, 24);
}
