// שכבת נתונים: Supabase (דרך REST עם מפתח service_role — בצד השרת בלבד)
// או זיכרון (LL_DEV_MEMORY=1) לבדיקות מקומיות.
import crypto from 'node:crypto';

function env(name) {
  return process.env[name] ? String(process.env[name]) : '';
}

// ---------------------------------------------------------------------------
// Supabase REST
// ---------------------------------------------------------------------------
async function rest(method, path, { query, body, prefer } = {}) {
  const base = env('LL_SUPABASE_URL').replace(/\/$/, '');
  const key = env('LL_SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) throw new Error('Supabase is not configured (LL_SUPABASE_URL / LL_SUPABASE_SERVICE_ROLE_KEY)');
  const url = new URL(`${base}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  if (prefer) headers.prefer = prefer;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const eq = (v) => `eq.${v}`;

const supabaseRepo = {
  events: {
    list: () => rest('GET', 'll_events', { query: { select: '*', order: 'created_at.desc' } }),
    get: async (id) => (await rest('GET', 'll_events', { query: { select: '*', id: eq(id) } }))[0] || null,
    getActive: async () => (await rest('GET', 'll_events', { query: { select: '*', is_active: 'eq.true', limit: '1' } }))[0] || null,
    getBySlug: async (slug) => (await rest('GET', 'll_events', { query: { select: '*', slug: eq(slug) } }))[0] || null,
    create: async (row) => (await rest('POST', 'll_events', { body: row, prefer: 'return=representation' }))[0],
    update: async (id, patch) => (await rest('PATCH', 'll_events', { query: { id: eq(id) }, body: patch, prefer: 'return=representation' }))[0],
    setActive: async (id) => {
      await rest('PATCH', 'll_events', { query: { is_active: 'eq.true' }, body: { is_active: false } });
      if (id) await rest('PATCH', 'll_events', { query: { id: eq(id) }, body: { is_active: true } });
    },
    remove: (id) => rest('DELETE', 'll_events', { query: { id: eq(id) } }),
  },
  registrations: {
    list: (eventId) => rest('GET', 'll_registrations', { query: { select: '*', event_id: eq(eventId), order: 'created_at.asc' } }),
    upsert: async (row) => (await rest('POST', 'll_registrations', {
      query: { on_conflict: 'event_id,phone' }, body: row, prefer: 'resolution=merge-duplicates,return=representation',
    }))[0],
    remove: (id) => rest('DELETE', 'll_registrations', { query: { id: eq(id) } }),
    removeAll: (eventId) => rest('DELETE', 'll_registrations', { query: { event_id: eq(eventId) } }),
    count: async (eventId) => (await rest('GET', 'll_registrations', { query: { select: 'id', event_id: eq(eventId) } })).length,
  },
  questions: {
    list: (eventId) => rest('GET', 'll_questions', { query: { select: '*', event_id: eq(eventId), order: 'position.asc,created_at.asc' } }),
    get: async (id) => (await rest('GET', 'll_questions', { query: { select: '*', id: eq(id) } }))[0] || null,
    create: async (row) => (await rest('POST', 'll_questions', { body: row, prefer: 'return=representation' }))[0],
    update: async (id, patch) => (await rest('PATCH', 'll_questions', { query: { id: eq(id) }, body: patch, prefer: 'return=representation' }))[0],
    remove: (id) => rest('DELETE', 'll_questions', { query: { id: eq(id) } }),
  },
  answers: {
    upsertMany: (rows) => rows.length === 0 ? null : rest('POST', 'll_answers', {
      query: { on_conflict: 'question_id,phone' }, body: rows, prefer: 'resolution=merge-duplicates',
    }),
    listByEvent: (eventId) => rest('GET', 'll_answers', { query: { select: '*', event_id: eq(eventId) } }),
    removeByQuestion: (qid) => rest('DELETE', 'll_answers', { query: { question_id: eq(qid) } }),
    removeByEvent: (eventId) => rest('DELETE', 'll_answers', { query: { event_id: eq(eventId) } }),
  },
  audit: {
    add: (row) => rest('POST', 'll_audit', { body: row }),
    list: (limit = 200) => rest('GET', 'll_audit', { query: { select: '*', order: 'at.desc', limit: String(limit) } }),
  },
  // מחזיר true אם מותר (פחות מ-max ניסיונות בחלון הזמן). אטומי — פונקציית SQL.
  rateLimit: async (key, max, windowSec) => rest('POST', 'rpc/ll_hit_rate_limit', {
    body: { p_key: key, p_max: max, p_window_seconds: windowSec },
  }),
};

// ---------------------------------------------------------------------------
// זיכרון (פיתוח)
// ---------------------------------------------------------------------------
const mem = globalThis.__llMem || (globalThis.__llMem = {
  events: [], registrations: [], questions: [], answers: [], audit: [], limits: new Map(),
});
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

const memoryRepo = {
  events: {
    list: async () => [...mem.events].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    get: async (id) => mem.events.find((e) => e.id === id) || null,
    getActive: async () => mem.events.find((e) => e.is_active) || null,
    getBySlug: async (slug) => mem.events.find((e) => e.slug === slug) || null,
    create: async (row) => { const e = { id: uid(), created_at: now(), is_active: false, registration_open: true, ...row }; mem.events.push(e); return e; },
    update: async (id, patch) => { const e = mem.events.find((x) => x.id === id); if (e) Object.assign(e, patch); return e; },
    setActive: async (id) => { for (const e of mem.events) e.is_active = e.id === id; },
    remove: async (id) => {
      mem.events = mem.events.filter((e) => e.id !== id);
      mem.registrations = mem.registrations.filter((r) => r.event_id !== id);
      mem.questions = mem.questions.filter((q) => q.event_id !== id);
      mem.answers = mem.answers.filter((a) => a.event_id !== id);
    },
  },
  registrations: {
    list: async (eventId) => mem.registrations.filter((r) => r.event_id === eventId),
    upsert: async (row) => {
      const ex = mem.registrations.find((r) => r.event_id === row.event_id && r.phone === row.phone);
      if (ex) { Object.assign(ex, row); return ex; }
      const r = { id: uid(), created_at: now(), ...row }; mem.registrations.push(r); return r;
    },
    remove: async (id) => { mem.registrations = mem.registrations.filter((r) => r.id !== id); },
    removeAll: async (eventId) => { mem.registrations = mem.registrations.filter((r) => r.event_id !== eventId); },
    count: async (eventId) => mem.registrations.filter((r) => r.event_id === eventId).length,
  },
  questions: {
    list: async (eventId) => mem.questions.filter((q) => q.event_id === eventId).sort((a, b) => a.position - b.position),
    get: async (id) => mem.questions.find((q) => q.id === id) || null,
    create: async (row) => { const q = { id: uid(), created_at: now(), status: 'draft', ...row }; mem.questions.push(q); return q; },
    update: async (id, patch) => { const q = mem.questions.find((x) => x.id === id); if (q) Object.assign(q, patch); return q; },
    remove: async (id) => { mem.questions = mem.questions.filter((q) => q.id !== id); mem.answers = mem.answers.filter((a) => a.question_id !== id); },
  },
  answers: {
    upsertMany: async (rows) => {
      for (const row of rows) {
        const ex = mem.answers.find((a) => a.question_id === row.question_id && a.phone === row.phone);
        if (ex) Object.assign(ex, row); else mem.answers.push({ ...row });
      }
    },
    listByEvent: async (eventId) => mem.answers.filter((a) => a.event_id === eventId),
    removeByQuestion: async (qid) => { mem.answers = mem.answers.filter((a) => a.question_id !== qid); },
    removeByEvent: async (eventId) => { mem.answers = mem.answers.filter((a) => a.event_id !== eventId); },
  },
  audit: {
    add: async (row) => { mem.audit.push({ id: mem.audit.length + 1, at: now(), ...row }); },
    list: async (limit = 200) => [...mem.audit].reverse().slice(0, limit),
  },
  rateLimit: async (key, max, windowSec) => {
    const t = Date.now();
    const cur = mem.limits.get(key);
    if (!cur || t - cur.start > windowSec * 1000) { mem.limits.set(key, { start: t, count: 1 }); return true; }
    cur.count++;
    return cur.count <= max;
  },
};

export const db = env('LL_DEV_MEMORY') === '1' ? memoryRepo : supabaseRepo;
