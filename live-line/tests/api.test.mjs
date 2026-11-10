// בדיקת אינטגרציה של כל ה-API מול מסד בזיכרון וקו מדומה
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.LL_DEV_MODE = '1';
process.env.LL_DEV_MEMORY = '1';
process.env.LL_YEMOT_MOCK = '1';
process.env.LL_MOCK_PARTICIPANTS = '12';
process.env.YEMOT_CONF_ROOM = '1';
const { hashPassword } = await import('../netlify/lib/security.mjs');
const { base32Encode, currentTotp } = await import('../netlify/lib/totp.mjs');
process.env.LL_ADMIN_PASSWORD_HASH = hashPassword('test-password-123');
process.env.LL_TOTP_SECRET = base32Encode(crypto.randomBytes(20));
process.env.LL_SESSION_SECRET = crypto.randomBytes(48).toString('base64url');
const { default: handler } = await import('../netlify/functions/api.mjs');

let cookie = '';
let ipCounter = 0;
async function call(method, path, body, { csrf = true, withCookie = true, ip } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (csrf) headers['x-ll-csrf'] = '1';
  if (withCookie && cookie) headers.cookie = cookie;
  const req = new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handler(req, { ip: ip || `10.0.0.${++ipCounter % 250}` });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, data: await res.json() };
}

test('admin endpoints require login', async () => {
  const r = await call('GET', '/api/admin/live', undefined, { withCookie: false });
  assert.equal(r.status, 401);
});

test('login rejects wrong password and wrong code', async () => {
  let r = await call('POST', '/api/auth/login', { password: 'nope', code: currentTotp(process.env.LL_TOTP_SECRET) });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/auth/login', { password: 'test-password-123', code: '123456' === currentTotp(process.env.LL_TOTP_SECRET) ? '654321' : '123456' });
  assert.equal(r.status, 401);
  assert.equal(cookie, '');
});

test('login rate limit blocks brute force from one IP', async () => {
  let last;
  for (let i = 0; i < 7; i++) last = await call('POST', '/api/auth/login', { password: 'x', code: '000000' }, { ip: '9.9.9.9' });
  assert.equal(last.status, 429);
});

test('login without CSRF header is blocked', async () => {
  const r = await call('POST', '/api/auth/login', { password: 'test-password-123', code: currentTotp(process.env.LL_TOTP_SECRET) }, { csrf: false });
  assert.equal(r.status, 403);
});

let eventId, slug;
test('full flow: login, event, registration, live, trivia', async () => {
  let r = await call('POST', '/api/auth/login', { password: 'test-password-123', code: currentTotp(process.env.LL_TOTP_SECRET) });
  assert.equal(r.status, 200);
  assert.ok(cookie.startsWith('ll_session_dev='));

  r = await call('POST', '/api/admin/events', { title: 'ערב טריוויה', event_date: '2026-12-01' });
  assert.equal(r.status, 201);
  eventId = r.data.id; slug = r.data.slug;
  r = await call('POST', `/api/admin/events/${eventId}/activate`, {});
  assert.equal(r.status, 200);

  // הרשמה ציבורית (ללא עוגייה)
  const saved = cookie; cookie = '';
  r = await call('GET', `/api/public/event/${slug}`, undefined, { withCookie: false });
  assert.equal(r.data.title, 'ערב טריוויה');
  r = await call('POST', '/api/public/register', { slug, full_name: 'דנה לוי', phone: '+972 52 000 0000', consent: true }, { withCookie: false });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('POST', '/api/public/register', { slug, full_name: '<script>', phone: '0520000007', consent: true }, { withCookie: false });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/public/register', { slug, full_name: 'בלי הסכמה', phone: '0520000007' }, { withCookie: false });
  assert.equal(r.status, 400);
  cookie = saved;

  r = await call('GET', `/api/admin/registrations?event=${eventId}`);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].phone, '0520000000');

  // מצב חי — המשתתף הראשון במדומה הוא 0520000000 ולכן יזוהה בשמו
  r = await call('GET', '/api/admin/live');
  assert.equal(r.status, 200);
  assert.ok(r.data.room.found);
  assert.equal(r.data.counts.listeners, 12);
  assert.equal(r.data.counts.admins, 1);
  const dana = r.data.participants.find((p) => p.phone === '0520000000');
  assert.equal(dana.name, 'דנה לוי');

  // פעולות: השתקה/פתיחה/הוצאה; המנחה מוגן
  const adminId = r.data.participants.find((p) => p.admin).id;
  r = await call('POST', '/api/admin/live/action', { action: 'unmute', ids: [dana.id, adminId, 'not-in-room-123'] });
  assert.equal(r.data.count, 1);
  r = await call('POST', '/api/admin/live/action', { action: 'unmute', scope: 'all_listeners' });
  assert.equal(r.status, 200); // 12 < 30 — לא נדרש אישור
  r = await call('POST', '/api/admin/live/action', { action: 'mute', scope: 'all_listeners' });
  assert.equal(r.data.count, 12);
  r = await call('POST', '/api/admin/live/action', { action: 'kick', ids: [adminId] });
  assert.equal(r.data.count, 0);
  r = await call('POST', '/api/admin/live/action', { action: 'path:add:admin', ids: [dana.id] });
  assert.equal(r.status, 400);

  // טריוויה
  r = await call('POST', '/api/admin/questions', { event_id: eventId, text: 'מה בירת ישראל?', options: ['ירושלים', 'חיפה', 'אילת', 'צפת'], correct: '1', points: 10 });
  assert.equal(r.status, 201);
  const qid = r.data.id;
  r = await call('POST', `/api/admin/questions/${qid}/open`, {});
  assert.equal(r.data.status, 'open');
  // מדמים הקשות: כל מאזין מקיש
  const mock = globalThis.__llMock;
  for (const c of mock.calls) if (!c.admin) c.survey = c.callerIdNum === '0520000000' ? '1' : '3';
  r = await call('GET', '/api/admin/live');
  assert.equal(r.data.openQuestion.totalAnswers, 12);
  assert.equal(r.data.openQuestion.distribution['1'], 1);
  assert.equal(r.data.openQuestion.distribution['3'], 11);
  r = await call('POST', `/api/admin/questions/${qid}/close`, { correct: '1' });
  assert.equal(r.data.status, 'closed');
  r = await call('GET', `/api/admin/leaderboard?event=${eventId}`);
  assert.equal(r.data[0].name, 'דנה לוי');
  assert.equal(r.data[0].score, 10);
  // אחרי סגירה ההקשות אופסו
  assert.ok(mock.calls.filter((c) => !c.admin).every((c) => c.survey === null));

  r = await call('GET', '/api/admin/audit');
  assert.ok(r.data.some((a) => a.action === 'question_close'));
  assert.ok(r.data.some((a) => a.action === 'login_failed'));
  assert.ok(r.data.every((a) => !JSON.stringify(a).includes('10.0.0.')), 'IP must not be stored in clear');

  r = await call('POST', '/api/auth/logout', {});
  r = await call('GET', '/api/admin/live');
  assert.equal(r.status, 401);
});

test('tampered session cookie is rejected', async () => {
  cookie = 'll_session_dev=eyJleHAiOjk5OTk5OTk5OTksInYiOiIxIn0.forged';
  const r = await call('GET', '/api/admin/live');
  assert.equal(r.status, 401);
});
