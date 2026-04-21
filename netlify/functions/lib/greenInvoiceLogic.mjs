/**
 * לוגיקה משותפת: חשבונית ירוקה (Morning) API — אסימון + יצירת מסמך.
 * בסיס ייצור: https://api.greeninvoice.co.il/api/v1
 * Sandbox: https://sandbox.d.greeninvoice.co.il/api/v1
 */

const DEFAULT_BASE = 'https://api.greeninvoice.co.il/api/v1';

let tokenCache = { token: null, expiresAt: 0 };

function getBaseUrl(env) {
  const u = (env.GREEN_INVOICE_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  return u;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  return { res, data, text };
}

export async function getGreenInvoiceToken(env) {
  const id = env.GREEN_INVOICE_API_ID;
  const secret = env.GREEN_INVOICE_SECRET;
  if (!id || !secret) {
    const err = new Error('Green Invoice not configured (GREEN_INVOICE_API_ID / GREEN_INVOICE_SECRET)');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const base = getBaseUrl(env);
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
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
    err.status = res.status;
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

/**
 * @param {string} path - e.g. /documents
 * @param {object} env - process.env
 * @param {object} opts - fetch options
 */
export async function greenInvoiceApi(env, path, opts = {}) {
  let { token, base } = await getGreenInvoiceToken(env);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  let { res, data } = await fetchJson(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    invalidateToken();
    ({ token, base } = await getGreenInvoiceToken(env));
    ({ res, data } = await fetchJson(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    }));
  }
  return { res, data, base };
}

/**
 * @param {object} body - parsed JSON from client
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{ statusCode: number, body: object }>}
 */
export async function handleGreenInvoiceBody(body, env) {
  if (!body || typeof body !== 'object') {
    return { statusCode: 400, body: { success: false, error: 'Invalid body' } };
  }

  const action = body.action;
  if (action === 'ping') {
    try {
      await getGreenInvoiceToken(env);
      return { statusCode: 200, body: { success: true, message: 'התחברות לחשבונית ירוקה הצליחה' } };
    } catch (e) {
      const code = e.code === 'NOT_CONFIGURED' ? 503 : 401;
      return {
        statusCode: code,
        body: {
          success: false,
          error: e.message || String(e),
          ...(e.code === 'NOT_CONFIGURED' && {
            hint: 'הגדירו ב-Netlify (או ב-server/.env לפיתוח): GREEN_INVOICE_API_ID, GREEN_INVOICE_SECRET. אופציונלי: GREEN_INVOICE_BASE_URL לסנדבוקס.',
          }),
        },
      };
    }
  }

  if (action !== 'createDocument') {
    return { statusCode: 400, body: { success: false, error: 'Unknown action' } };
  }

  const clientName = (body.clientName || '').trim();
  const amount = Number(body.amount);
  if (!clientName || !Number.isFinite(amount) || amount <= 0) {
    return {
      statusCode: 400,
      body: { success: false, error: 'נדרשים שם לקוח וסכום חיובי' },
    };
  }

  const currency = (body.currency || 'ILS').toUpperCase();
  const lang = body.lang || 'he';
  const docDate = (body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const documentType = body.documentType != null ? Number(body.documentType) : 320;
  const itemDescription = (body.itemDescription || body.description || 'שירות').trim();
  const description = (body.description || itemDescription).trim();

  const client = {
    name: clientName,
    country: body.clientCountry || 'IL',
  };
  const email = (body.clientEmail || '').trim();
  if (email) client.emails = [email];
  const phone = (body.clientPhone || '').trim();
  if (phone) client.phone = phone;

  const vatType = body.vatType != null ? Number(body.vatType) : 0;
  const paymentType = body.paymentType != null ? Number(body.paymentType) : 4;
  const paymentDate = (body.paymentDate || docDate).slice(0, 10);

  const payload = {
    type: documentType,
    description,
    lang,
    currency,
    date: docDate,
    client,
    income: [
      {
        description: itemDescription,
        quantity: 1,
        price: amount,
        currency,
        vatType,
      },
    ],
    payment: [
      {
        price: amount,
        currency,
        date: paymentDate,
        type: paymentType,
      },
    ],
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
    return {
      statusCode: 200,
      body: {
        success: true,
        id: data?.id,
        number: data?.number,
        url: data?.url,
        raw: data,
      },
    };
  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') {
      return {
        statusCode: 503,
        body: {
          success: false,
          error: e.message,
          hint: 'הגדירו GREEN_INVOICE_API_ID ו-GREEN_INVOICE_SECRET ב-Netlify.',
        },
      };
    }
    return { statusCode: 500, body: { success: false, error: e.message || String(e) } };
  }
}
