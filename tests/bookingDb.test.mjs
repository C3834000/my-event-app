import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/db.js';

test('מעבר סטטוס ועדכון הפרטים מבוצעים יחד ורק אם הסטטוס בענן תואם', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.VITE_SUPABASE_URL;
  const previousKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(String(url)), options });
    return new Response(JSON.stringify({ id: 'e_1', status: 'בקשת הזמנה ממתינה לאישור', email: 'new@example.com' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ table: 'events', action: 'transitionEventStatus', id: 'e_1', expectedStatus: 'בקשת הזמנה ממתינה לאישור', nextStatus: 'בקשת הזמנה ממתינה לאישור', data: { id: 'wrong', status: 'wrong', email: 'new@example.com', ignoredColumn: 'ignored' } }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).data.email, 'new@example.com');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'PATCH');
    assert.equal(calls[0].url.searchParams.get('id'), 'eq.e_1');
    assert.equal(calls[0].url.searchParams.get('status'), 'eq.בקשת הזמנה ממתינה לאישור');
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'new@example.com', status: 'בקשת הזמנה ממתינה לאישור' });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = previousKey;
  }
});

test('כאשר הסטטוס כבר השתנה, השרת אינו יוצר או מעדכן אירוע חלופי', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.VITE_SUPABASE_URL;
  const previousKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object', details: 'The result contains 0 rows' }), {
      status: 406, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ table: 'events', action: 'transitionEventStatus', id: 'e_1', expectedStatus: 'בקשת הזמנה ממתינה לאישור', nextStatus: 'שוריין' }) });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).data, null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = previousKey;
  }
});
