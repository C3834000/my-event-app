import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MCP_AUDIENCE = 'https://myecrm2026.netlify.app/mcp';
const MCP_ISSUER = 'https://myecrm2026.netlify.app';

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

export function configuredTokens() {
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

function b64urlDecode(value) {
  try {
    return Buffer.from(String(value), 'base64url');
  } catch {
    return null;
  }
}

function safeEqualString(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** OAuth access tokens issued by our MCP authorization endpoint. */
export function verifyMcpAccessToken(token) {
  const [prefix, encodedPayload, signature] = String(token || '').split('.');
  if (prefix !== 'mcp1' || !encodedPayload || !signature) return null;

  const secret = configuredTokens()[0];
  if (!secret) return null;

  const expected = createHmac('sha256', secret)
    .update(`${prefix}.${encodedPayload}`)
    .digest('base64url');
  if (!safeEqualString(signature, expected)) return null;

  const decoded = b64urlDecode(encodedPayload);
  if (!decoded) return null;

  try {
    const claims = JSON.parse(decoded.toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const scopes = String(claims.scope || '').split(/\s+/).filter(Boolean);
    if (
      claims.iss !== MCP_ISSUER ||
      claims.aud !== MCP_AUDIENCE ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      (claims.nbf && claims.nbf > now) ||
      !scopes.includes('crm.read')
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/** Bearer / X-API-Key / ?token= — מקבל CRM_API_KEY או אחד מהמפתחות הקיימים */
export function authorize(event) {
  const tokens = configuredTokens();
  if (!tokens.length) {
    return { ok: false, statusCode: 503, error: 'CRM_API_KEY is not configured' };
  }
  const provided = readProvidedToken(event);
  const staticMatch = provided && tokens.some((token) => safeEqualString(provided, token));
  const oauthClaims = provided ? verifyMcpAccessToken(provided) : null;
  if (!staticMatch && !oauthClaims) {
    return { ok: false, statusCode: 401, error: 'Unauthorized' };
  }
  return { ok: true, oauthClaims };
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
