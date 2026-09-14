import { createClient } from '@supabase/supabase-js';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export function json(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

export function ok(data, meta = {}, extra = {}) {
  return json(200, {
    success: true,
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      ...meta,
    },
    ...extra,
  });
}

export function fail(statusCode, error) {
  return json(statusCode, {
    success: false,
    error,
    meta: { generatedAt: new Date().toISOString() },
  });
}

export function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  return null;
}

function configuredTokens() {
  return [
    process.env.CRM_API_KEY,
    process.env.GPT_READONLY_TOKEN,
    process.env.CASHFLOW_API_TOKEN,
  ].map((v) => String(v || '').trim()).filter(Boolean);
}

export function readProvidedToken(event) {
  const params = event.queryStringParameters || {};
  const headers = event.headers || {};
  const authorization = headers.authorization || headers.Authorization || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = headers['x-api-key'] || headers['X-API-Key'];
  return String(bearer || apiKey || params.token || '').trim();
}

/** Bearer / X-API-Key / ?token= — מקבל CRM_API_KEY או אחד מהמפתחות הקיימים */
export function authorize(event) {
  const tokens = configuredTokens();
  if (!tokens.length) {
    return { ok: false, statusCode: 503, error: 'CRM_API_KEY is not configured' };
  }
  const provided = readProvidedToken(event);
  if (!provided || !tokens.includes(provided)) {
    return { ok: false, statusCode: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

export function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

export function money(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function logError(scope, err) {
  const message = err?.message || String(err);
  const details = err?.details || err?.hint || '';
  console.error(`[${scope}]`, message, details || '', err?.stack || '');
}
