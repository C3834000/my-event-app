import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { authorize, configuredTokens, logError } from './lib/apiCommon.mjs';

const ORIGIN = 'https://myecrm2026.netlify.app';
const RESOURCE = `${ORIGIN}/mcp`;
const SCOPE = 'crm.read';
const ACCESS_TOKEN_TTL = 60 * 60;
const REFRESH_TOKEN_TTL = 180 * 24 * 60 * 60;
const CODE_TTL = 90;
// One-way fingerprint only. The setup key itself is never committed or logged.
const SETUP_KEY_SHA256 = '278c4dde1a90dafa53c674269fab7ffadba1a2ef64714597856b21ac299cfd15';

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function response(statusCode, body, headers = JSON_HEADERS) {
  return {
    statusCode,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function jsonError(statusCode, error, description) {
  return response(statusCode, {
    error,
    error_description: description,
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function validSetupKey(value) {
  const fingerprint = createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
  return safeEqual(fingerprint, SETUP_KEY_SHA256);
}

function signingSecret() {
  return configuredTokens()[0] || '';
}

function sign(prefix, claims) {
  const secret = signingSecret();
  if (!secret) throw new Error('CRM API key is not configured');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${prefix}.${payload}`)
    .digest('base64url');
  return `${prefix}.${payload}.${signature}`;
}

function verify(token, expectedPrefix) {
  const [prefix, encoded, signature] = String(token || '').split('.');
  const secret = signingSecret();
  if (!secret || prefix !== expectedPrefix || !encoded || !signature) return null;
  const expected = createHmac('sha256', secret)
    .update(`${prefix}.${encoded}`)
    .digest('base64url');
  if (!safeEqual(signature, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || claims.exp <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

function parseBody(event) {
  const raw = event.body || '';
  const contentType = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '');
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function pathOf(event) {
  const path = String(event.path || '');
  if (path.includes('oauth-protected-resource')) return 'protected-resource';
  if (path.includes('oauth-authorization-server')) return 'authorization-server';
  if (path.endsWith('/oauth/register')) return 'register';
  if (path.endsWith('/oauth/authorize')) return 'authorize';
  if (path.endsWith('/oauth/token')) return 'token';
  return '';
}

function validRedirectUri(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && (host === 'chatgpt.com' || host.endsWith('.chatgpt.com'))) {
      return url.pathname.startsWith('/connector/oauth/') ||
        url.pathname === '/connector_platform_oauth_redirect';
    }
    return url.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost');
  } catch {
    return false;
  }
}

function validResource(value) {
  return !value || String(value) === RESOURCE;
}

function redirectError(redirectUri, state, error, description) {
  if (!validRedirectUri(redirectUri)) return jsonError(400, error, description);
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  url.searchParams.set('iss', ORIGIN);
  return {
    statusCode: 302,
    headers: { Location: url.toString(), 'Cache-Control': 'no-store' },
    body: '',
  };
}

function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [ORIGIN],
    bearer_methods_supported: ['header'],
    scopes_supported: [SCOPE],
    resource_documentation: `${ORIGIN}/`,
  };
}

function authorizationServerMetadata() {
  return {
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/oauth/authorize`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function authorizationPage(params, error = '') {
  const hidden = [
    'client_id',
    'redirect_uri',
    'state',
    'code_challenge',
    'code_challenge_method',
    'resource',
    'scope',
  ].map((key) =>
    `<input type="hidden" name="${key}" value="${escapeHtml(params[key] || '')}">`
  ).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>חיבור ChatGPT ל־CRM</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#172033;margin:0;min-height:100vh;display:grid;place-items:center}
    main{width:min(440px,calc(100% - 32px));background:white;border:1px solid #d9dee8;border-radius:16px;padding:28px;box-sizing:border-box}
    h1{font-size:22px;margin:0 0 10px}p{line-height:1.55;color:#526078;font-size:14px}
    label{display:block;font-weight:700;margin:20px 0 7px}
    input[type=password]{width:100%;box-sizing:border-box;border:1px solid #b9c2d0;border-radius:10px;padding:12px;font-size:16px}
    button{width:100%;margin-top:14px;border:0;border-radius:10px;background:#6d28d9;color:white;padding:12px;font-size:16px;font-weight:700;cursor:pointer}
    .error{color:#b42318;background:#fff1f0;border:1px solid #ffccc7;border-radius:8px;padding:9px}
    .scope{background:#f1f4f8;border-radius:8px;padding:10px;color:#344054}
  </style>
</head>
<body>
  <main>
    <h1>חיבור ChatGPT ל־CRM</h1>
    <p>ChatGPT מבקש גישת קריאה בלבד לנתוני הלקוחות, האירועים, הלידים, המשימות והתזרים.</p>
    <p class="scope">הרשאה: קריאת CRM ותזרים בלבד. אין אפשרות ליצור, לשנות או למחוק נתונים.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/oauth/authorize">
      ${hidden}
      <label for="access_key">מפתח הגישה ל־CRM</label>
      <input id="access_key" name="access_key" type="password" required autocomplete="current-password" autofocus>
      <button type="submit">אישור וחיבור</button>
    </form>
  </main>
</body>
</html>`;
}

function validateAuthorizationParams(params) {
  if (params.response_type !== 'code') return 'response_type חייב להיות code';
  if (!params.client_id) return 'חסר client_id';
  if (!validRedirectUri(params.redirect_uri)) return 'כתובת החזרה אינה מורשית';
  if (!params.code_challenge || params.code_challenge_method !== 'S256') return 'נדרש PKCE מסוג S256';
  if (!validResource(params.resource)) return 'המשאב המבוקש אינו מורשה';
  const scopes = String(params.scope || SCOPE).split(/\s+/);
  if (!scopes.includes(SCOPE)) return 'חסרה הרשאת crm.read';
  return '';
}

function issueAccessToken(subject = 'crm-owner') {
  const now = Math.floor(Date.now() / 1000);
  return sign('mcp1', {
    iss: ORIGIN,
    sub: subject,
    aud: RESOURCE,
    scope: SCOPE,
    iat: now,
    nbf: now - 5,
    exp: now + ACCESS_TOKEN_TTL,
    jti: randomBytes(16).toString('hex'),
  });
}

function issueRefreshToken(subject = 'crm-owner') {
  const now = Math.floor(Date.now() / 1000);
  return sign('mcpr1', {
    iss: ORIGIN,
    sub: subject,
    aud: RESOURCE,
    scope: SCOPE,
    iat: now,
    exp: now + REFRESH_TOKEN_TTL,
    jti: randomBytes(16).toString('hex'),
  });
}

function tokenResponse(subject) {
  return response(200, {
    access_token: issueAccessToken(subject),
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: issueRefreshToken(subject),
    scope: SCOPE,
  });
}

function handleRegister(event) {
  if (event.httpMethod !== 'POST') return jsonError(405, 'method_not_allowed', 'Use POST');
  const body = parseBody(event);
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!redirectUris.length || redirectUris.some((uri) => !validRedirectUri(uri))) {
    return jsonError(400, 'invalid_redirect_uri', 'Only ChatGPT connector or local Codex callback URLs are allowed');
  }
  const digest = createHash('sha256')
    .update(JSON.stringify({ redirectUris, name: body.client_name || '', nonce: randomBytes(8).toString('hex') }))
    .digest('base64url')
    .slice(0, 32);
  return response(201, {
    client_id: `chatgpt_${digest}`,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    client_name: body.client_name || 'ChatGPT CRM connector',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
}

function handleAuthorize(event) {
  const params = event.httpMethod === 'POST'
    ? parseBody(event)
    : (event.queryStringParameters || {});
  const validationError = validateAuthorizationParams(params);
  if (validationError) {
    return redirectError(params.redirect_uri, params.state, 'invalid_request', validationError);
  }

  if (event.httpMethod === 'GET') {
    return response(200, authorizationPage(params), HTML_HEADERS);
  }
  if (event.httpMethod !== 'POST') {
    return jsonError(405, 'method_not_allowed', 'Use GET or POST');
  }

  const auth = authorize({
    headers: { authorization: `Bearer ${params.access_key || ''}` },
    queryStringParameters: {},
  });
  if (!auth.ok && !validSetupKey(params.access_key)) {
    return response(401, authorizationPage(params, 'מפתח הגישה אינו תקין'), HTML_HEADERS);
  }

  const now = Math.floor(Date.now() / 1000);
  const code = sign('mcpc1', {
    iss: ORIGIN,
    aud: `${ORIGIN}/oauth/token`,
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    resource: RESOURCE,
    scope: SCOPE,
    sub: 'crm-owner',
    iat: now,
    exp: now + CODE_TTL,
    jti: randomBytes(16).toString('hex'),
  });

  const redirect = new URL(params.redirect_uri);
  redirect.searchParams.set('code', code);
  if (params.state) redirect.searchParams.set('state', params.state);
  redirect.searchParams.set('iss', ORIGIN);
  return {
    statusCode: 302,
    headers: { Location: redirect.toString(), 'Cache-Control': 'no-store' },
    body: '',
  };
}

function handleToken(event) {
  if (event.httpMethod !== 'POST') return jsonError(405, 'method_not_allowed', 'Use POST');
  const body = parseBody(event);

  if (body.grant_type === 'refresh_token') {
    const claims = verify(body.refresh_token, 'mcpr1');
    if (
      !claims ||
      claims.iss !== ORIGIN ||
      claims.aud !== RESOURCE ||
      !String(claims.scope || '').split(/\s+/).includes(SCOPE) ||
      !validResource(body.resource)
    ) {
      return jsonError(400, 'invalid_grant', 'Refresh token is invalid or expired');
    }
    return tokenResponse(claims.sub);
  }

  if (body.grant_type !== 'authorization_code') {
    return jsonError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  const claims = verify(body.code, 'mcpc1');
  if (
    !claims ||
    claims.iss !== ORIGIN ||
    claims.aud !== `${ORIGIN}/oauth/token` ||
    claims.client_id !== body.client_id ||
    (body.redirect_uri && claims.redirect_uri !== body.redirect_uri) ||
    claims.resource !== RESOURCE ||
    !validResource(body.resource)
  ) {
    return jsonError(400, 'invalid_grant', 'Authorization code is invalid or expired');
  }

  const challenge = createHash('sha256')
    .update(String(body.code_verifier || ''))
    .digest('base64url');
  if (!safeEqual(challenge, claims.code_challenge)) {
    return jsonError(400, 'invalid_grant', 'PKCE verification failed');
  }

  return tokenResponse(claims.sub);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }

  try {
    switch (pathOf(event)) {
      case 'protected-resource':
        return response(200, protectedResourceMetadata());
      case 'authorization-server':
        return response(200, authorizationServerMetadata());
      case 'register':
        return handleRegister(event);
      case 'authorize':
        return handleAuthorize(event);
      case 'token':
        return handleToken(event);
      default:
        return jsonError(404, 'not_found', 'OAuth endpoint not found');
    }
  } catch (err) {
    logError('oauth', err);
    return jsonError(500, 'server_error', 'Authorization service failed');
  }
};
