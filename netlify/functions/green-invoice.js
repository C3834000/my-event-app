const DEFAULT_BASE = 'https://api.greeninvoice.co.il/api/v1';

let tokenCache = { token: null, expiresAt: 0 };

function getBaseUrl(env) {
  return (env.GREEN_INVOICE_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { _raw: text }; }
  return { res, data };
}

async function getToken(env) {
  const id = env.GREEN_INVOICE_API_ID;
  const secret = env.GREEN_INVOICE_SECRET;
  if (!id || !secret) {
    const err = new Error('Green Invoice not configured (GREEN_INVOICE_API_ID / GREEN_INVOICE_SECRET)');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const base = getBaseUrl(env);
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return { token: tokenCache.token, base };
  }
  const { res, data } = await fetchJson(`${base}/account/token`, {
    method: 'POST',
    body: JSON.stringify({ id, secret }),
  });
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.code = 'AUTH_FAILED';
    throw err;
  }
  const token = data?.token;
  if (!token) {
    const err = new Error('No token in Green Invoice response');
    err.code = 'AUTH_FAILED';
    throw err;
  }
  tokenCache = { token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return { token, base };
}

function invalidateToken() {
  tokenCache = { token: null, expiresAt: 0 };
}

async function greenInvoiceApi(env, path, opts = {}) {
  let { token, base } = await getToken(env);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  let { res, data } = await fetchJson(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    invalidateToken();
    ({ token, base } = await getToken(env));
    ({ res, data } = await fetchJson(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    }));
  }
  return { res, data };
}

async function handleBody(body, env) {
  if (!body || typeof body !== 'object') {
    return { statusCode: 400, body: { success: false, error: 'Invalid body' } };
  }

  if (body.action === 'ping') {
    try {
      await getToken(env);
      return { statusCode: 200, body: { success: true, message: 'התחברות לחשבונית ירוקה הצליחה' } };
    } catch (e) {
      const code = e.code === 'NOT_CONFIGURED' ? 503 : 401;
      return {
        statusCode: code,
        body: {
          success: false,
          error: e.message || String(e),
          ...(e.code === 'NOT_CONFIGURED' && {
            hint: 'הגדירו ב-Netlify: GREEN_INVOICE_API_ID, GREEN_INVOICE_SECRET. אופציונלי: GREEN_INVOICE_BASE_URL לסנדבוקס.',
          }),
        },
      };
    }
  }

  if (body.action !== 'createDocument') {
    return { statusCode: 400, body: { success: false, error: 'Unknown action' } };
  }

  const clientName = (body.clientName || '').trim();
  const amount = Number(body.amount);
  if (!clientName || !Number.isFinite(amount) || amount <= 0) {
    return { statusCode: 400, body: { success: false, error: 'נדרשים שם לקוח וסכום חיובי' } };
  }

  const currency = (body.currency || 'ILS').toUpperCase();
  const lang = body.lang || 'he';
  const docDate = (body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const documentType = body.documentType != null ? Number(body.documentType) : 320;
  const itemDescription = (body.itemDescription || body.description || 'שירות').trim();
  const description = (body.description || itemDescription).trim();
  const vatType = body.vatType != null ? Number(body.vatType) : 1;
  const paymentType = body.paymentType != null ? Number(body.paymentType) : 4;
  const paymentDate = (body.paymentDate || docDate).slice(0, 10);

  const client = { name: clientName, country: body.clientCountry || 'IL' };
  const email = (body.clientEmail || '').trim();
  if (email) client.emails = [email];
  const phone = (body.clientPhone || '').trim();
  if (phone) client.phone = phone;

  const payload = {
    type: documentType,
    description,
    lang,
    currency,
    date: docDate,
    signed: true,
    client,
    income: [{ description: itemDescription, quantity: 1, price: amount, currency, vatType }],
    payment: [{ price: amount, currency, date: paymentDate, type: paymentType }],
  };

  try {
    const { res, data } = await greenInvoiceApi(env, '/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || data?.error || JSON.stringify(data);
      return {
        statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
        body: { success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg), details: data },
      };
    }

    const docId = data?.id;
    let emailSent = false;
    if (docId && email) {
      try {
        const { res: sendRes } = await greenInvoiceApi(env, `/documents/${docId}/send`, {
          method: 'POST',
          body: JSON.stringify({ emails: [email] }),
        });
        emailSent = sendRes.ok;
      } catch {
        // email sending is best-effort; do not fail the whole request
      }
    }

    return {
      statusCode: 200,
      body: { success: true, id: docId, number: data?.number, url: data?.url, emailSent, raw: data },
    };
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') {
      return {
        statusCode: 503,
        body: { success: false, error: e.message, hint: 'הגדירו GREEN_INVOICE_API_ID ו-GREEN_INVOICE_SECRET ב-Netlify.' },
      };
    }
    return { statusCode: 500, body: { success: false, error: e.message || String(e) } };
  }
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) };
  }

  const { statusCode, body: out } = await handleBody(body, process.env);
  return { statusCode, headers, body: JSON.stringify(out) };
};
