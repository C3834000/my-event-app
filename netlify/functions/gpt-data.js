import { createClient } from '@supabase/supabase-js';

const ALLOWED_RESOURCES = new Set(['events', 'customers', 'leads', 'tasks']);
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

const TABLE_CONFIG = {
  events: { orderBy: 'date', ascending: true },
  customers: { orderBy: 'name', ascending: true },
  leads: { orderBy: 'last_updated_at', ascending: false },
  tasks: { orderBy: 'due_date', ascending: true },
};

function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function readAuthToken(event) {
  const params = event.queryStringParameters || {};
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer || params.token || '';
}

function hasValidToken(event) {
  const configured = process.env.GPT_READONLY_TOKEN;
  if (!configured) return { ok: false, statusCode: 503, error: 'GPT_READONLY_TOKEN is not configured' };
  const provided = readAuthToken(event);
  if (provided !== configured) return { ok: false, statusCode: 401, error: 'Unauthorized' };
  return { ok: true };
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function money(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function eventSummary(events) {
  return events.reduce(
    (acc, event) => {
      const amount = money(event.amount);
      const paid = money(event.paidAmount);
      acc.count += 1;
      acc.totalAmount += amount;
      acc.totalPaid += paid;
      acc.totalOutstanding += Math.max(0, amount - paid);
      if (event.paymentDate) acc.withPaymentDate += 1;
      return acc;
    },
    { count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0, withPaymentDate: 0 }
  );
}

async function fetchResource(supabase, resource, params) {
  if (!ALLOWED_RESOURCES.has(resource)) {
    throw new Error(`Unsupported resource: ${resource}`);
  }

  const config = TABLE_CONFIG[resource];
  let query = supabase.from(resource).select('*');

  if (resource === 'events') {
    if (params.from) query = query.gte('date', params.from);
    if (params.to) query = query.lte('date', params.to);
    if (params.status) query = query.eq('status', params.status);
    if (params.paymentStatus) query = query.eq('payment_status', params.paymentStatus);
    if (params.category) query = query.eq('category', params.category);
  }

  query = query.order(config.orderBy, { ascending: config.ascending }).limit(clampLimit(params.limit));

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(toCamel);
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = hasValidToken(event);
  if (!auth.ok) {
    return { statusCode: auth.statusCode, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const params = event.queryStringParameters || {};
  const resource = params.resource || 'events';

  try {
    const requestedResources = resource === 'all'
      ? Array.from(ALLOWED_RESOURCES)
      : resource.split(',').map((r) => r.trim()).filter(Boolean);

    const data = {};
    for (const item of requestedResources) {
      data[item] = await fetchResource(supabase, item, params);
    }

    const response = {
      generatedAt: new Date().toISOString(),
      resource,
      filters: {
        from: params.from || null,
        to: params.to || null,
        status: params.status || null,
        paymentStatus: params.paymentStatus || null,
        category: params.category || null,
        limit: clampLimit(params.limit),
      },
      data,
    };

    if (data.events) response.summary = { events: eventSummary(data.events) };

    return { statusCode: 200, headers, body: JSON.stringify(response) };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: err?.message || String(err) }),
    };
  }
};
