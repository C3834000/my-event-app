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

function pickArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function getTotalCount(data, fallbackLength) {
  const n = Number(data?.totalItems ?? data?.total ?? data?.count ?? data?.totalCount);
  return Number.isFinite(n) ? n : fallbackLength;
}

function normalizeDocument(doc) {
  const payment = Array.isArray(doc?.payment) ? doc.payment[0] : Array.isArray(doc?.payments) ? doc.payments[0] : undefined;
  const incomeRows = Array.isArray(doc?.income) ? doc.income : Array.isArray(doc?.items) ? doc.items : [];
  const incomeTotal = incomeRows.reduce((sum, row) => {
    const price = Number(row?.price ?? row?.total ?? row?.amount ?? 0);
    const quantity = Number(row?.quantity ?? 1);
    return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(quantity) ? quantity : 1);
  }, 0);
  const amount = Number(
    doc?.amount ??
    doc?.total ??
    doc?.totalAmount ??
    doc?.price ??
    payment?.price ??
    payment?.amount ??
    incomeTotal
  );
  const netAmount = Number(
    doc?.amountDueVat ??
    doc?.amountExcludeVat ??
    doc?.amountDueVatLocal ??
    incomeRows.reduce((sum, row) => sum + Number(row?.amount ?? row?.price ?? 0), 0)
  );
  const vatAmount = Number(doc?.vat ?? doc?.vatLocal ?? (amount - netAmount));
  return {
    id: String(doc?.id ?? doc?._id ?? ''),
    number: doc?.number ?? doc?.documentNumber ?? doc?.serialNumber,
    type: Number(doc?.type ?? doc?.documentType ?? 0) || undefined,
    date: String(doc?.date ?? doc?.documentDate ?? doc?.createdAt ?? '').slice(0, 10),
    paymentDate: String(payment?.date ?? doc?.paymentDate ?? doc?.date ?? doc?.documentDate ?? '').slice(0, 10),
    clientName: doc?.client?.name ?? doc?.clientName ?? doc?.customerName ?? '',
    description: doc?.description ?? doc?.remarks ?? '',
    amount: Number.isFinite(amount) ? amount : 0,
    netAmount: Number.isFinite(netAmount) ? netAmount : (Number.isFinite(amount) ? amount / 1.18 : 0),
    vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
    status: Number(doc?.status),
    amountOpened: Number(doc?.amountOpened ?? 0),
    currency: doc?.currency ?? payment?.currency ?? 'ILS',
    url: doc?.url,
    raw: doc,
  };
}

function normalizePaymentRecord(row) {
  const doc = row?.document || row?.doc || {};
  const amount = Number(row?.price ?? row?.amount ?? row?.total ?? doc?.total ?? doc?.amount ?? 0);
  const netAmount = Number(doc?.amountDueVat ?? doc?.amountExcludeVat ?? doc?.amountDueVatLocal ?? (amount / 1.18));
  const vatAmount = Number(doc?.vat ?? doc?.vatLocal ?? (amount - netAmount));
  return {
    id: String(row?.id ?? doc?.id ?? ''),
    number: doc?.number ?? doc?.documentNumber ?? row?.documentNumber,
    type: Number(doc?.type ?? row?.documentType ?? row?.type ?? 0) || undefined,
    date: String(doc?.date ?? doc?.documentDate ?? row?.date ?? '').slice(0, 10),
    paymentDate: String(row?.date ?? row?.paymentDate ?? doc?.date ?? doc?.documentDate ?? '').slice(0, 10),
    clientName: doc?.client?.name ?? row?.client?.name ?? row?.clientName ?? '',
    description: doc?.description ?? row?.description ?? '',
    amount: Number.isFinite(amount) ? amount : 0,
    netAmount: Number.isFinite(netAmount) ? netAmount : (Number.isFinite(amount) ? amount / 1.18 : 0),
    vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
    status: Number(doc?.status ?? row?.status),
    amountOpened: Number(doc?.amountOpened ?? 0),
    currency: row?.currency ?? doc?.currency ?? 'ILS',
    url: doc?.url,
    raw: row,
  };
}

async function searchGreenInvoicePaged(env, path, buildPayload, normalize, maxPages, pageSize) {
  const docs = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const { res, data } = await greenInvoiceApi(env, path, {
      method: 'POST',
      body: JSON.stringify(buildPayload(pageIndex)),
    });
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || data?.error || JSON.stringify(data);
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      err.status = res.status;
      err.details = data;
      throw err;
    }
    const pageDocs = pickArray(data);
    docs.push(...pageDocs.map(normalize).filter(d => d.id || d.amount > 0));
    const total = getTotalCount(data, docs.length);
    if (pageDocs.length < pageSize || docs.length >= total) break;
  }
  return docs;
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

  if (body.action === 'searchDocuments') {
    const fromDate = String(body.fromDate || `${new Date().getFullYear()}-01-01`).slice(0, 10);
    const toDate = String(body.toDate || `${new Date().getFullYear()}-12-31`).slice(0, 10);
    const type = Array.isArray(body.type) ? body.type.map(Number).filter(Number.isFinite) : [305, 320, 400];
    const pageSize = Math.min(Math.max(Number(body.pageSize) || 100, 1), 100);
    const maxPages = Math.min(Math.max(Number(body.maxPages) || 20, 1), 50);
    const docs = [];

    const attempts = [
      {
        path: '/documents/search',
        normalize: normalizeDocument,
        buildPayload: (pageIndex) => ({ page: pageIndex, pageSize, fromDate, toDate, sort: 'documentDate' }),
      },
      {
        path: '/documents/search',
        normalize: normalizeDocument,
        buildPayload: (pageIndex) => ({ page: pageIndex + 1, pageSize, fromDate, toDate, sort: 'documentDate' }),
      },
      {
        path: '/documents/search',
        normalize: normalizeDocument,
        buildPayload: (pageIndex) => ({ page: pageIndex, pageSize, fromDate, toDate }),
      },
      {
        path: '/documents/search',
        normalize: normalizeDocument,
        buildPayload: (pageIndex) => ({ page: pageIndex + 1, pageSize, fromDate, toDate }),
      },
      {
        path: '/documents/search',
        normalize: normalizeDocument,
        buildPayload: (pageIndex) => ({ page: pageIndex, pageSize, from: fromDate, to: toDate }),
      },
      {
        path: '/documents/payments/search',
        normalize: normalizePaymentRecord,
        buildPayload: (pageIndex) => ({ page: pageIndex, pageSize, fromDate, toDate }),
      },
      {
        path: '/documents/payments/search',
        normalize: normalizePaymentRecord,
        buildPayload: (pageIndex) => ({ page: pageIndex + 1, pageSize, fromDate, toDate }),
      },
    ];

    try {
      let lastError = null;
      for (const attempt of attempts) {
        try {
          docs.splice(0, docs.length, ...(await searchGreenInvoicePaged(env, attempt.path, attempt.buildPayload, attempt.normalize, maxPages, pageSize)));
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
        }
      }
      if (lastError) {
        return {
          statusCode: lastError.status >= 400 && lastError.status < 600 ? lastError.status : 502,
          body: { success: false, error: lastError.message || String(lastError), details: lastError.details },
        };
      }

      const filteredDocs = docs.filter(d =>
        (!type.length || !d.type || type.includes(Number(d.type))) &&
        Number(d.status) !== 4
      );

      return {
        statusCode: 200,
        body: { success: true, fromDate, toDate, documents: filteredDocs, count: filteredDocs.length },
      };
    } catch (e) {
      if (e.code === 'NOT_CONFIGURED') {
        return { statusCode: 503, body: { success: false, error: e.message } };
      }
      return { statusCode: 500, body: { success: false, error: e.message || String(e) } };
    }
  }

  // ── convertDocument: יצירת מסמך חדש מתוך מסמך קיים ──────────────────────
  if (body.action === 'convertDocument') {
    const parentDocId = (body.parentDocId || '').trim();
    const newType = body.documentType != null ? Number(body.documentType) : null;
    if (!parentDocId || !newType) {
      return { statusCode: 400, body: { success: false, error: 'נדרשים parentDocId ו-documentType' } };
    }
    try {
      const { res, data } = await greenInvoiceApi(env, `/documents/${parentDocId}/copy`, {
        method: 'POST',
        body: JSON.stringify({ type: newType, signed: true }),
      });
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || data?.error || JSON.stringify(data);
        return {
          statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
          body: { success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg), details: data },
        };
      }
      const docId = data?.id;
      const email = (body.clientEmail || '').trim();
      let emailSent = false;
      if (docId && email) {
        try {
          const { res: sr } = await greenInvoiceApi(env, `/documents/${docId}/send`, {
            method: 'POST',
            body: JSON.stringify({ emails: [email] }),
          });
          emailSent = sr.ok;
        } catch { /* best-effort */ }
      }
      return {
        statusCode: 200,
        body: { success: true, id: docId, number: data?.number, url: data?.url, emailSent, raw: data },
      };
    } catch (e) {
      if (e.code === 'NOT_CONFIGURED') {
        return { statusCode: 503, body: { success: false, error: e.message } };
      }
      return { statusCode: 500, body: { success: false, error: e.message || String(e) } };
    }
  }

  if (body.action !== 'createDocument') {
    return { statusCode: 400, body: { success: false, error: 'Unknown action' } };
  }

  // Strip portal-booking prefix that may appear in clientName or descriptions
  const PORTAL_PREFIX = /^הזמנה\s+מפורטל[:\s]*/u;
  const cleanStr = (s) => (s || '').trim().replace(PORTAL_PREFIX, '').trim();

  const clientName = cleanStr(body.clientName) || 'לקוח';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { statusCode: 400, body: { success: false, error: 'נדרש סכום חיובי' } };
  }

  const currency = (body.currency || 'ILS').toUpperCase();
  const lang = body.lang || 'he';
  const docDate = (body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const documentType = body.documentType != null ? Number(body.documentType) : 320;
  const itemDescription = cleanStr(body.itemDescription || body.description) || 'שירות';
  const description = cleanStr(body.description) || itemDescription;
  const vatType = body.vatType != null ? Number(body.vatType) : 1;
  const paymentType = body.paymentType != null ? Number(body.paymentType) : 4;
  const paymentDate = (body.paymentDate || docDate).slice(0, 10);

  const email = (body.clientEmail || '').trim();
  const phone = (body.clientPhone || '').trim();
  const client = { name: clientName, country: body.clientCountry || 'IL' };
  if (email) client.emails = [email];
  if (phone) client.phone = phone;

  const payload = {
    type: documentType,
    description,
    lang,
    currency,
    date: docDate,
    signed: true,
    sendByEmail: email ? true : false,
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
    // sendByEmail:true in the payload triggers automatic emailing during creation.
    // As a backup, also call the explicit send endpoint.
    let emailSent = !!(email && payload.sendByEmail);
    if (docId && email && !emailSent) {
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
