import { createHash, timingSafeEqual } from 'node:crypto';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function sameSecret(left, right) {
  const a = createHash('sha256').update(String(left), 'utf8').digest();
  const b = createHash('sha256').update(String(right), 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** משווה את הסיסמה למשתנה הסביבה ADMIN_PASSWORD. הסיסמה לא נשמרת בקוד. */
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false }) };
  }

  const expected = String(process.env.ADMIN_PASSWORD || '');
  if (!expected) {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'ADMIN_PASSWORD is not configured' }),
    };
  }

  let password = '';
  try {
    password = String(JSON.parse(event.body || '{}').password || '');
  } catch {
    password = '';
  }

  const ok = sameSecret(password, expected);
  return {
    statusCode: ok ? 200 : 401,
    headers: CORS,
    body: JSON.stringify({ ok }),
  };
};
