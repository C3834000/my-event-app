// ============================================================================
// תחליף מקומי מלא ל-@supabase/supabase-js עבור סביבת הבדיקה של מאגר המסמכים.
// - טבלאות: נשמרות לדיסק (test-env/db.json) — נתונים אמיתיים ועמידים.
// - אחסון: קבצים אמיתיים על הדיסק (test-env/storage/) — גישה אך ורק דרך
//   כתובות חתומות עם token חד-פעמי/מוגבל-זמן, כמו bucket פרטי ב-Supabase.
// - אכיפת unique על documents.file_hash (קוד 23505) כמו האינדקס במיגרציה.
// אין שום חיבור רשת חיצוני. אין נגיעה בייצור.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// DOCS_TEST_DATA_DIR — תיקיית נתונים חלופית (לבדיקות אוטומטיות, כדי לא לגעת בנתוני המשתמש)
const ROOT = path.resolve(process.cwd(), process.env.DOCS_TEST_DATA_DIR || 'test-env');
const DB_FILE = path.join(ROOT, 'db.json');
const STORAGE_DIR = path.join(ROOT, 'storage');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

// ── בסיס נתונים ──────────────────────────────────────────────────────────────
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { documents: [], document_sources: [], transactions: [], payments: [], document_payments: [], files: {} };
  }
}
const db = loadDb();
db.files ||= {}; // storagePath → { disk, mime, size }

let saveTimer = null;
function persist() {
  // כתיבה סינכרונית מיידית — הבדיקות מקביליות והעקביות חשובה מהביצועים
  clearTimeout(saveTimer);
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1), 'utf8');
}

// ── טוקנים לכתובות חתומות (בזיכרון — תקפים לחיי התהליך) ─────────────────────
const uploadTokens = new Map(); // token → { path, used }
const readTokens = new Map();   // token → { path, exp }

const newToken = () => crypto.randomBytes(24).toString('hex');

export function baseUrl() {
  return process.env.DOCS_TEST_BASE_URL || 'http://localhost:4000';
}

const diskNameFor = (storagePath) =>
  crypto.createHash('sha1').update(storagePath).digest('hex') +
  (path.extname(storagePath).match(/^\.[\w]{1,8}$/) ? path.extname(storagePath) : '.bin');

/** נקרא משרת הבדיקה כשמגיע PUT לכתובת העלאה חתומה */
export function acceptSignedUpload(token, buffer, mime) {
  const entry = uploadTokens.get(token);
  if (!entry || entry.used) return { ok: false, status: 403, error: 'טוקן העלאה לא תקף' };
  entry.used = true;
  const disk = diskNameFor(entry.path);
  fs.writeFileSync(path.join(STORAGE_DIR, disk), buffer);
  db.files[entry.path] = { disk, mime: mime || 'application/octet-stream', size: buffer.length };
  persist();
  return { ok: true, path: entry.path };
}

/** נקרא משרת הבדיקה כשמגיע GET לכתובת צפייה חתומה */
export function resolveSignedRead(token) {
  const entry = readTokens.get(token);
  if (!entry) return { ok: false, status: 403, error: 'טוקן צפייה לא תקף' };
  if (Date.now() > entry.exp) { readTokens.delete(token); return { ok: false, status: 403, error: 'פג תוקף הכתובת החתומה' }; }
  const meta = db.files[entry.path];
  if (!meta) return { ok: false, status: 404, error: 'הקובץ לא נמצא' };
  const full = path.join(STORAGE_DIR, meta.disk);
  if (!fs.existsSync(full)) return { ok: false, status: 404, error: 'הקובץ לא נמצא בדיסק' };
  return { ok: true, file: full, mime: meta.mime };
}

export function resetLocalState() {
  for (const k of Object.keys(db)) {
    if (Array.isArray(db[k])) db[k] = [];
  }
  db.files = {};
  uploadTokens.clear();
  readTokens.clear();
  if (fs.existsSync(STORAGE_DIR)) {
    for (const f of fs.readdirSync(STORAGE_DIR)) fs.unlinkSync(path.join(STORAGE_DIR, f));
  }
  persist();
}

// ── שכבת השאילתות (תואמת ל-API של supabase-js שהפונקציה משתמשת בו) ──────────
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.mode = 'select';
    this.payload = null;
    this.wantSingle = false;
    this.wantMaybe = false;
  }
  select() { return this; }
  insert(rows) { this.mode = 'insert'; this.payload = rows; return this; }
  update(row) { this.mode = 'update'; this.payload = row; return this; }
  eq(col, val) { this.filters.push(r => r[col] === val); return this; }
  neq(col, val) { this.filters.push(r => r[col] !== val); return this; }
  gte(col, val) { this.filters.push(r => r[col] != null && r[col] >= val); return this; }
  lte(col, val) { this.filters.push(r => r[col] != null && r[col] <= val); return this; }
  in(col, arr) { this.filters.push(r => arr.includes(r[col])); return this; }
  is(col, val) { this.filters.push(r => (val === null ? r[col] == null : r[col] === val)); return this; }
  not(col, op, val) {
    if (op === 'is' && val === null) this.filters.push(r => r[col] != null);
    return this;
  }
  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  maybeSingle() { this.wantMaybe = true; return this; }
  single() { this.wantSingle = true; return this; }

  _rows() {
    let rows = db[this.table] || [];
    for (const f of this.filters) rows = rows.filter(f);
    for (const { col, asc } of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    return rows;
  }

  _exec() {
    if (this.mode === 'insert') {
      const inserted = [];
      for (const row of this.payload) {
        // אכיפת unique index על documents.file_hash — כמו במיגרציה
        if (this.table === 'documents' && row.file_hash) {
          const dup = (db.documents || []).find(d => d.file_hash === row.file_hash);
          if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "documents_file_hash_uq"' } };
        }
        if ((db[this.table] || []).some(r => r.id === row.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key (id)' } };
        }
        const full = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
        (db[this.table] ||= []).push(full);
        inserted.push(full);
      }
      persist();
      return this._shape(inserted);
    }
    if (this.mode === 'update') {
      const rows = this._rows();
      for (const r of rows) Object.assign(r, this.payload);
      persist();
      return this._shape(rows);
    }
    return this._shape(this._rows().map(r => ({ ...r })));
  }

  _shape(rows) {
    if (this.wantSingle) {
      if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${rows.length}` } };
      return { data: rows[0], error: null };
    }
    if (this.wantMaybe) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then(resolve, reject) { return Promise.resolve(this._exec()).then(resolve, reject); }
}

// ── ה-API שהפונקציה האמיתית משתמשת בו ───────────────────────────────────────
export function createClient(_url, _key) {
  return {
    from: (table) => new Query(table),
    storage: {
      from: (_bucket) => ({
        createSignedUploadUrl: async (storagePath) => {
          const token = newToken();
          uploadTokens.set(token, { path: storagePath, used: false });
          return { data: { signedUrl: `${baseUrl()}/storage/upload/${token}`, token, path: storagePath }, error: null };
        },
        createSignedUrl: async (storagePath, ttlSeconds) => {
          if (!db.files[storagePath]) return { data: null, error: { message: 'Object not found' } };
          const token = newToken();
          readTokens.set(token, { path: storagePath, exp: Date.now() + (ttlSeconds || 3600) * 1000 });
          return { data: { signedUrl: `${baseUrl()}/storage/signed/${token}` }, error: null };
        },
        remove: async (paths) => {
          for (const p of paths) {
            const meta = db.files[p];
            if (meta) {
              try { fs.unlinkSync(path.join(STORAGE_DIR, meta.disk)); } catch { /* ignore */ }
              delete db.files[p];
            }
          }
          persist();
          return { data: paths, error: null };
        },
      }),
    },
  };
}
