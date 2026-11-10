// נקודת כניסה יחידה לכל ה-API של "קו חי".
// כל בקשה עוברת כאן: אימות, CSRF, הגבלת קצב, ולידציה ורישום ביומן.
import crypto from 'node:crypto';
import { db } from '../lib/db.mjs';
import { getConference, callAction, ALLOWED_ACTIONS } from '../lib/yemot.mjs';
import { normalizePhone, isValidIsraeliPhone } from '../lib/phone.mjs';
import {
  checkAdminCredentials, createSessionCookie, clearSessionCookie, getSession, checkCsrf, ipHash,
} from '../lib/security.mjs';

export const config = { path: '/api/*' };

const MAX_BODY = 20_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'הבקשה גדולה מדי');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new HttpError(400, 'גוף בקשה לא תקין');
  }
}

function str(v, { min = 0, max = 200, name = 'שדה' } = {}) {
  const s = typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (s.length < min || s.length > max) throw new HttpError(400, `${name} לא תקין`);
  return s;
}

function uuid(v) {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, 'מזהה לא תקין');
  return v;
}

function dateOrNull(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'תאריך לא תקין');
  return v;
}

function clientIp(req, context) {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function audit(action, details, ip) {
  try { await db.audit.add({ action, details, ip_hash: ipHash(ip) }); } catch (e) { console.error('audit failed', e); }
}

async function limit(key, max, windowSec) {
  const ok = await db.rateLimit(key, max, windowSec);
  if (!ok) throw new HttpError(429, 'יותר מדי ניסיונות. נסו שוב מאוחר יותר');
}

function newSlug() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

function cleanOptions(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 9).map((o, i) => str(o ?? '', { max: 120, name: `תשובה ${i + 1}` }));
}

// ---------------------------------------------------------------------------
// לוגיקת טריוויה
// ---------------------------------------------------------------------------
function answerKey(p) {
  return p.phone || `id:${p.id}`;
}

async function recordAnswers(eventId, question, participants) {
  const rows = participants
    .filter((p) => !p.admin && p.survey && /^[0-9]$/.test(p.survey))
    .map((p) => ({ question_id: question.id, event_id: eventId, phone: answerKey(p), digit: p.survey, answered_at: new Date().toISOString() }));
  await db.answers.upsertMany(rows);
}

function buildLeaderboard(questions, answers, regByPhone) {
  const closed = new Map(questions.filter((q) => q.status === 'closed' && q.correct).map((q) => [q.id, q]));
  const scores = new Map();
  for (const a of answers) {
    const q = closed.get(a.question_id);
    if (!q) continue;
    const s = scores.get(a.phone) || { phone: a.phone, score: 0, correct: 0, answered: 0 };
    s.answered++;
    if (a.digit === q.correct) { s.score += q.points; s.correct++; }
    scores.set(a.phone, s);
  }
  return [...scores.values()]
    .map((s) => ({ ...s, name: regByPhone.get(s.phone)?.full_name || null }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct);
}

async function liveState() {
  const event = await db.events.getActive();
  const conf = await getConference();
  let questions = [], answers = [], regs = [];
  if (event) {
    [questions, regs] = await Promise.all([db.questions.list(event.id), db.registrations.list(event.id)]);
    const open = questions.find((q) => q.status === 'open');
    if (open) await recordAnswers(event.id, open, conf.participants);
    answers = await db.answers.listByEvent(event.id);
  }
  const regByPhone = new Map(regs.map((r) => [r.phone, r]));
  const leaderboard = buildLeaderboard(questions, answers, regByPhone);
  const scoreByPhone = new Map(leaderboard.map((l) => [l.phone, l.score]));
  const open = questions.find((q) => q.status === 'open') || null;

  const participants = conf.participants.map((p) => ({
    id: p.id,
    phone: p.phone,
    name: regByPhone.get(p.phone)?.full_name || null,
    registered: regByPhone.has(p.phone),
    admin: p.admin,
    mute: p.mute,
    hand: p.hand,
    survey: p.survey,
    duration: p.duration,
    score: scoreByPhone.get(answerKey(p)) || 0,
  }));

  let openQuestion = null;
  if (open) {
    const dist = {};
    let total = 0;
    for (const a of answers) if (a.question_id === open.id) { dist[a.digit] = (dist[a.digit] || 0) + 1; total++; }
    openQuestion = { ...open, distribution: dist, totalAnswers: total };
  }

  const listeners = participants.filter((p) => !p.admin);
  return {
    serverTime: new Date().toISOString(),
    event: event ? { id: event.id, title: event.title, event_date: event.event_date } : null,
    room: { key: conf.roomKey, found: Boolean(conf.roomKey), availableRooms: conf.rooms.length },
    counts: {
      total: participants.length,
      listeners: listeners.length,
      admins: participants.length - listeners.length,
      unmuted: listeners.filter((p) => !p.mute).length,
      hands: listeners.filter((p) => p.hand).length,
      registeredOnLine: listeners.filter((p) => p.registered).length,
      registeredTotal: regs.length,
    },
    participants,
    openQuestion,
    leaderboard: leaderboard.slice(0, 50),
  };
}

// ---------------------------------------------------------------------------
// ניתוב
// ---------------------------------------------------------------------------
async function handlePublic(req, parts, ip) {
  // GET /api/public/event/:slug
  if (req.method === 'GET' && parts[0] === 'event' && parts[1]) {
    const slug = String(parts[1]).toLowerCase();
    if (!/^[a-z0-9-]{4,40}$/.test(slug)) throw new HttpError(404, 'לא נמצא');
    const e = await db.events.getBySlug(slug);
    if (!e) throw new HttpError(404, 'לא נמצא');
    return json({ title: e.title, event_date: e.event_date, registration_open: e.registration_open });
  }
  // POST /api/public/register
  if (req.method === 'POST' && parts[0] === 'register') {
    if (req.headers.get('x-ll-csrf') !== '1') throw new HttpError(403, 'בקשה נחסמה');
    await limit(`reg:${ipHash(ip)}`, 8, 3600);
    const body = await readJson(req);
    if (body.website) return json({ ok: true }); // מלכודת בוטים — שדה נסתר שבני אדם לא ממלאים
    const slug = str(body.slug, { min: 4, max: 40, name: 'קישור' }).toLowerCase();
    const event = await db.events.getBySlug(slug);
    if (!event || !event.registration_open) throw new HttpError(400, 'ההרשמה לאירוע זה סגורה');
    const full_name = str(body.full_name, { min: 2, max: 60, name: 'שם' });
    if (!/^[\p{L}\p{M}'"׳״ .-]+$/u.test(full_name)) throw new HttpError(400, 'שם יכול להכיל אותיות בלבד');
    const phone = normalizePhone(body.phone);
    if (!isValidIsraeliPhone(phone)) throw new HttpError(400, 'מספר טלפון לא תקין');
    if (body.consent !== true) throw new HttpError(400, 'יש לאשר את תנאי ההרשמה');
    if ((await db.registrations.count(event.id)) >= 1000) throw new HttpError(400, 'ההרשמה מלאה');
    await db.registrations.upsert({ event_id: event.id, full_name, phone, source: 'web' });
    return json({ ok: true });
  }
  throw new HttpError(404, 'לא נמצא');
}

async function handleAuth(req, parts, ip) {
  if (parts[0] === 'me' && req.method === 'GET') {
    return json({ authenticated: Boolean(getSession(req)) });
  }
  if (parts[0] === 'login' && req.method === 'POST') {
    if (!checkCsrf(req)) throw new HttpError(403, 'בקשה נחסמה');
    await limit(`login:${ipHash(ip)}`, 5, 900);
    await limit('login:global', 30, 900);
    const body = await readJson(req);
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '').slice(0, 6) : '';
    const result = checkAdminCredentials(password, code);
    if (!result.ok) {
      await audit('login_failed', { reason: result.reason }, ip);
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
      if (result.reason === 'server_not_configured') throw new HttpError(500, 'השרת לא הוגדר. ראו README');
      throw new HttpError(401, 'סיסמה או קוד אימות שגויים');
    }
    await audit('login', {}, ip);
    return json({ ok: true }, 200, { 'set-cookie': createSessionCookie() });
  }
  if (parts[0] === 'logout' && req.method === 'POST') {
    if (!checkCsrf(req)) throw new HttpError(403, 'בקשה נחסמה');
    if (getSession(req)) await audit('logout', {}, ip);
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  }
  throw new HttpError(404, 'לא נמצא');
}

async function handleAdmin(req, parts, url, ip) {
  if (!getSession(req)) throw new HttpError(401, 'נדרשת התחברות');
  const m = req.method;
  if (m !== 'GET' && !checkCsrf(req)) throw new HttpError(403, 'בקשה נחסמה');
  const [res, id, sub] = parts;

  // ----- שידור חי -----
  if (res === 'live' && !id && m === 'GET') return json(await liveState());

  if (res === 'live' && id === 'action' && m === 'POST') {
    const body = await readJson(req);
    const action = String(body.action || '');
    if (!ALLOWED_ACTIONS.has(action) || action === 'reset_survey') throw new HttpError(400, 'פעולה לא מוכרת');
    const conf = await getConference();
    const byId = new Map(conf.participants.map((p) => [p.id, p]));
    let targets;
    if (body.scope === 'all_listeners') {
      targets = conf.participants.filter((p) => !p.admin);
      if (action === 'unmute' && targets.length > 30 && body.confirm !== true) {
        throw new HttpError(409, 'פתיחת מיקרופון ליותר מ-30 משתתפים דורשת אישור');
      }
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 300).map(String) : [];
      // רק משתתפים שנמצאים כרגע בחדר שלנו, ואף פעם לא המנחה
      targets = ids.map((i) => byId.get(i)).filter(Boolean);
    }
    targets = targets.filter((p) => !p.admin);
    const r = await callAction(targets.map((p) => p.id), action);
    await audit(`live_${action}`, { scope: body.scope || 'selected', count: r.count, phones: targets.slice(0, 20).map((p) => p.phone) }, ip);
    return json({ ok: true, count: r.count });
  }

  // ----- אירועים -----
  if (res === 'events') {
    if (!id && m === 'GET') return json(await db.events.list());
    if (!id && m === 'POST') {
      const body = await readJson(req);
      const row = { title: str(body.title, { min: 1, max: 120, name: 'שם האירוע' }), event_date: dateOrNull(body.event_date), slug: newSlug(), registration_open: true };
      const e = await db.events.create(row);
      await audit('event_create', { id: e.id, title: e.title }, ip);
      return json(e, 201);
    }
    const eventId = uuid(id);
    if (sub === 'activate' && m === 'POST') {
      await db.events.setActive(eventId);
      await audit('event_activate', { id: eventId }, ip);
      return json({ ok: true });
    }
    if (!sub && m === 'PATCH') {
      const body = await readJson(req);
      const patch = {};
      if ('title' in body) patch.title = str(body.title, { min: 1, max: 120, name: 'שם האירוע' });
      if ('event_date' in body) patch.event_date = dateOrNull(body.event_date);
      if ('registration_open' in body) patch.registration_open = body.registration_open === true;
      const e = await db.events.update(eventId, patch);
      await audit('event_update', { id: eventId, ...patch }, ip);
      return json(e);
    }
    if (!sub && m === 'DELETE') {
      await db.events.remove(eventId);
      await audit('event_delete', { id: eventId }, ip);
      return json({ ok: true });
    }
  }

  // ----- נרשמים -----
  if (res === 'registrations') {
    if (!id && m === 'GET') return json(await db.registrations.list(uuid(url.searchParams.get('event'))));
    if (!id && m === 'POST') {
      const body = await readJson(req);
      const event_id = uuid(body.event_id);
      const full_name = str(body.full_name, { min: 2, max: 60, name: 'שם' });
      const phone = normalizePhone(body.phone);
      if (!isValidIsraeliPhone(phone)) throw new HttpError(400, 'מספר טלפון לא תקין');
      const r = await db.registrations.upsert({ event_id, full_name, phone, source: 'admin' });
      await audit('registration_add', { event_id, phone }, ip);
      return json(r, 201);
    }
    if (!id && m === 'DELETE') {
      const event_id = uuid(url.searchParams.get('event'));
      await db.registrations.removeAll(event_id);
      await audit('registration_delete_all', { event_id }, ip);
      return json({ ok: true });
    }
    if (id && m === 'DELETE') {
      await db.registrations.remove(uuid(id));
      await audit('registration_delete', { id }, ip);
      return json({ ok: true });
    }
  }

  // ----- שאלות טריוויה -----
  if (res === 'questions') {
    if (!id && m === 'GET') return json(await db.questions.list(uuid(url.searchParams.get('event'))));
    if (!id && m === 'POST') {
      const body = await readJson(req);
      const event_id = uuid(body.event_id);
      const existing = await db.questions.list(event_id);
      if (existing.length >= 200) throw new HttpError(400, 'יותר מדי שאלות');
      const q = await db.questions.create({
        event_id,
        position: existing.length ? Math.max(...existing.map((x) => x.position)) + 1 : 1,
        text: str(body.text, { min: 1, max: 500, name: 'השאלה' }),
        options: cleanOptions(body.options),
        correct: /^[1-9]$/.test(String(body.correct ?? '')) ? String(body.correct) : null,
        points: Math.max(0, Math.min(1000, Number.parseInt(body.points, 10) || 10)),
        status: 'draft',
      });
      await audit('question_create', { id: q.id }, ip);
      return json(q, 201);
    }
    const qid = uuid(id);
    const q = await db.questions.get(qid);
    if (!q) throw new HttpError(404, 'שאלה לא נמצאה');

    if (!sub && m === 'PATCH') {
      const body = await readJson(req);
      const patch = {};
      if ('text' in body) patch.text = str(body.text, { min: 1, max: 500, name: 'השאלה' });
      if ('options' in body) patch.options = cleanOptions(body.options);
      if ('correct' in body) patch.correct = /^[1-9]$/.test(String(body.correct ?? '')) ? String(body.correct) : null;
      if ('points' in body) patch.points = Math.max(0, Math.min(1000, Number.parseInt(body.points, 10) || 0));
      if ('position' in body) patch.position = Number.parseInt(body.position, 10) || 0;
      const updated = await db.questions.update(qid, patch);
      await audit('question_update', { id: qid }, ip);
      return json(updated);
    }
    if (!sub && m === 'DELETE') {
      if (q.status === 'open') throw new HttpError(409, 'אי אפשר למחוק שאלה פתוחה');
      await db.questions.remove(qid);
      await audit('question_delete', { id: qid }, ip);
      return json({ ok: true });
    }
    if (sub === 'open' && m === 'POST') {
      const active = await db.events.getActive();
      if (!active || active.id !== q.event_id) throw new HttpError(409, 'השאלה אינה שייכת לאירוע הפעיל');
      const all = await db.questions.list(q.event_id);
      if (all.some((x) => x.status === 'open' && x.id !== qid)) throw new HttpError(409, 'כבר יש שאלה פתוחה. סגרו אותה קודם');
      // איפוס ההקשות של כל המאזינים, כדי שהקשה ישנה לא תיספר
      const conf = await getConference();
      await callAction(conf.participants.filter((p) => !p.admin).map((p) => p.id), 'reset_survey');
      await db.answers.removeByQuestion(qid);
      const updated = await db.questions.update(qid, { status: 'open', opened_at: new Date().toISOString(), closed_at: null });
      await audit('question_open', { id: qid }, ip);
      return json(updated);
    }
    if (sub === 'close' && m === 'POST') {
      if (q.status !== 'open') throw new HttpError(409, 'השאלה אינה פתוחה');
      const conf = await getConference();
      await recordAnswers(q.event_id, q, conf.participants); // קליטה אחרונה לפני הסגירה
      const body = await readJson(req);
      const patch = { status: 'closed', closed_at: new Date().toISOString() };
      if (/^[1-9]$/.test(String(body.correct ?? ''))) patch.correct = String(body.correct);
      const updated = await db.questions.update(qid, patch);
      await callAction(conf.participants.filter((p) => !p.admin).map((p) => p.id), 'reset_survey');
      await audit('question_close', { id: qid, correct: updated.correct }, ip);
      return json(updated);
    }
  }

  if (res === 'trivia' && id === 'reset' && m === 'POST') {
    const body = await readJson(req);
    const event_id = uuid(body.event_id);
    await db.answers.removeByEvent(event_id);
    for (const q of await db.questions.list(event_id)) {
      await db.questions.update(q.id, { status: 'draft', opened_at: null, closed_at: null });
    }
    await audit('trivia_reset', { event_id }, ip);
    return json({ ok: true });
  }

  if (res === 'leaderboard' && m === 'GET') {
    const event_id = uuid(url.searchParams.get('event'));
    const [questions, answers, regs] = await Promise.all([
      db.questions.list(event_id), db.answers.listByEvent(event_id), db.registrations.list(event_id),
    ]);
    return json(buildLeaderboard(questions, answers, new Map(regs.map((r) => [r.phone, r]))));
  }

  if (res === 'audit' && m === 'GET') return json(await db.audit.list(300));

  throw new HttpError(404, 'לא נמצא');
}

export default async function handler(req, context) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const ip = clientIp(req, context);
  try {
    const [area, ...rest] = parts;
    if (area === 'public') return await handlePublic(req, rest, ip);
    if (area === 'auth') return await handleAuth(req, rest, ip);
    if (area === 'admin') return await handleAdmin(req, rest, url, ip);
    throw new HttpError(404, 'לא נמצא');
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('[live-line api]', err);
    const msg = String(err?.message || '');
    if (msg.startsWith('Yemot')) return json({ error: 'שגיאה בתקשורת עם ימות המשיח', detail: msg.slice(0, 160) }, 502);
    return json({ error: 'שגיאת שרת' }, 500);
  }
}
