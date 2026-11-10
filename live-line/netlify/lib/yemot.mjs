// חיבור ל-API של ימות המשיח (call2all) — רק שתי פקודות: GetIncomingCalls ו-CallAction
// תיעוד: https://f2.freeivr.co.il/topic/55  (ניהול חדרי ועידה — CallAction)
import { phoneFromCallerId } from './phone.mjs';

const API_BASE = 'https://www.call2all.co.il/ym/api/';
const ID_RE = /^[A-Za-z0-9._-]{4,64}$/;
const BATCH = 40;

// הפעולות היחידות שהמערכת רשאית לשלוח. כל דבר אחר נחסם.
export const ALLOWED_ACTIONS = new Set(['mute', 'unmute', 'kick', 'raisehand', 'lowerhand', 'reset_survey']);

function env(name) {
  return process.env[name] ? String(process.env[name]) : '';
}

function useMock() {
  return env('LL_YEMOT_MOCK') === '1';
}

async function yemotGet(method, params = {}) {
  const token = env('YEMOT_API_KEY');
  if (!token) throw new Error('YEMOT_API_KEY is not configured');
  const url = new URL(method, API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { authorization: token }, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (!body || body.responseStatus !== 'OK') {
      const msg = body?.message || `HTTP ${res.status}`;
      throw new Error(`Yemot ${method} failed: ${msg}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeParticipant(c) {
  const data = c?.data && typeof c.data === 'object' ? c.data : {};
  const survey = data.survey != null ? String(data.survey) : null;
  return {
    id: String(c?.id ?? ''),
    phone: phoneFromCallerId(c?.callerIdNum),
    callerIdNum: c?.callerIdNum != null ? String(c.callerIdNum) : '',
    admin: Boolean(c?.admin ?? data.admin),
    mute: Boolean(c?.mute ?? data.mute),
    hand: Boolean(c?.hand),
    survey: survey && /^[0-9*#]$/.test(survey) ? survey : null,
    duration: Number(c?.duration) || 0,
  };
}

/**
 * מחזיר את מצב חדר הוועידה שהוגדר ב-YEMOT_CONF_ROOM (למשל "1" או "2/5").
 * מבנה confCalls לפי התיעוד: { "<מספר מערכת>-<שלוחה>": [ {id, mute, admin, hand, data:{survey}, callerIdNum, duration} ] }
 */
export async function getConference() {
  const body = useMock() ? mockGetIncomingCalls() : await yemotGet('GetIncomingCalls');
  const confCalls = body.confCalls && typeof body.confCalls === 'object' ? body.confCalls : {};
  const rooms = Object.keys(confCalls);
  const wanted = env('YEMOT_CONF_ROOM').replace(/^\/+|\/+$/g, '');
  let roomKey = null;
  if (wanted) roomKey = rooms.find((k) => k.endsWith('-' + wanted) || k === wanted) || null;
  else if (rooms.length === 1) roomKey = rooms[0];
  const list = roomKey && Array.isArray(confCalls[roomKey]) ? confCalls[roomKey] : [];
  return {
    roomKey,
    rooms,
    totalCallsInSystem: Number(body.callsCount) || 0,
    participants: list.map(normalizeParticipant).filter((p) => ID_RE.test(p.id)),
  };
}

/** מבצע פעולה על רשימת מזהי שיחה (מנות של 40). */
export async function callAction(ids, action) {
  if (!ALLOWED_ACTIONS.has(action)) throw new Error('action not allowed');
  const clean = [...new Set(ids)].filter((id) => ID_RE.test(String(id)));
  if (clean.length === 0) return { count: 0 };
  const yemotAction = action === 'reset_survey' ? 'path:remove:survey=' : action;
  let count = 0;
  for (let i = 0; i < clean.length; i += BATCH) {
    const chunk = clean.slice(i, i + BATCH);
    if (useMock()) mockCallAction(chunk, action);
    else await yemotGet('CallAction', { ids: chunk.join(':'), action: yemotAction });
    count += chunk.length;
  }
  return { count };
}

// ---------------------------------------------------------------------------
// מצב הדמיה (LL_YEMOT_MOCK=1) — לבדיקות בלי קו אמיתי
// ---------------------------------------------------------------------------
const mock = globalThis.__llMock || (globalThis.__llMock = { calls: null, tick: 0 });

function mockInit() {
  if (mock.calls) return;
  const n = Math.min(Number(env('LL_MOCK_PARTICIPANTS') || 25), 300);
  mock.calls = [{ id: 'adminmock000001', callerIdNum: '0501111111', admin: true, mute: false, hand: false, survey: null, start: Date.now() }];
  for (let i = 0; i < n; i++) {
    mock.calls.push({
      id: 'mock' + String(i).padStart(10, '0'),
      callerIdNum: '05' + String(20000000 + i * 7919).padStart(8, '0'),
      admin: false, mute: true, hand: false, survey: null, start: Date.now() - i * 4000,
    });
  }
}

function mockGetIncomingCalls() {
  mockInit();
  mock.tick++;
  for (const c of mock.calls) {
    if (c.admin) continue;
    if (Math.random() < 0.08 && c.survey == null) c.survey = String(1 + Math.floor(Math.random() * 4));
    if (Math.random() < 0.01) c.hand = !c.hand;
  }
  const room = (env('LL_MOCK_SYSTEM') || '0770000000') + '-' + (env('YEMOT_CONF_ROOM') || '1');
  return {
    responseStatus: 'OK',
    callsCount: mock.calls.length,
    confCalls: {
      [room]: mock.calls.map((c) => ({
        id: c.id, mute: c.mute, admin: c.admin, hand: c.hand,
        data: c.survey ? { survey: c.survey } : {},
        callerIdNum: c.callerIdNum, duration: Math.floor((Date.now() - c.start) / 1000),
      })),
    },
  };
}

function mockCallAction(ids, action) {
  mockInit();
  const set = new Set(ids);
  if (action === 'kick') { mock.calls = mock.calls.filter((c) => !set.has(c.id)); return; }
  for (const c of mock.calls) {
    if (!set.has(c.id)) continue;
    if (action === 'mute') c.mute = true;
    if (action === 'unmute') c.mute = false;
    if (action === 'raisehand') c.hand = true;
    if (action === 'lowerhand') c.hand = false;
    if (action === 'reset_survey') c.survey = null;
  }
}
