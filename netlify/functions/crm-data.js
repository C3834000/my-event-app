import {
  authorize,
  fail,
  getSupabase,
  handleOptions,
  logError,
  money,
  ok,
  toCamel,
} from './lib/apiCommon.mjs';

const ALLOWED_RESOURCES = new Set(['events', 'customers', 'leads', 'tasks']);
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

const TABLE_CONFIG = {
  events: { orderBy: 'date', ascending: true, dateColumn: 'date' },
  customers: { orderBy: 'name', ascending: true, dateColumn: null },
  leads: { orderBy: 'last_updated_at', ascending: false, dateColumn: 'follow_up_date' },
  tasks: { orderBy: 'due_date', ascending: true, dateColumn: 'due_date' },
};

const LOST_LEAD_STATUSES = new Set(['לא רלוונטי', 'הפך ללקוח', 'Lost', 'Converted']);

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function todayKey() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function parseDateKey(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function isCancelled(ev) {
  const s = String(ev.status || '');
  return s === 'בוטל' || s.toLowerCase() === 'cancelled';
}

async function fetchResource(supabase, resource, params) {
  if (!ALLOWED_RESOURCES.has(resource)) {
    const err = new Error(`Unsupported resource: ${resource}`);
    err.statusCode = 400;
    throw err;
  }

  const config = TABLE_CONFIG[resource];
  let query = supabase.from(resource).select('*');

  if (config.dateColumn && (params.from || params.to)) {
    if (params.from) query = query.gte(config.dateColumn, params.from);
    if (params.to) query = query.lte(config.dateColumn, params.to);
  }

  if (resource === 'events') {
    if (params.status) query = query.eq('status', params.status);
    if (params.paymentStatus) query = query.eq('payment_status', params.paymentStatus);
    if (params.category) query = query.eq('category', params.category);
  }

  query = query.order(config.orderBy, { ascending: config.ascending })
    .limit(clampLimit(params.limit));

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(toCamel);
}

function buildInsights(data) {
  const today = todayKey();
  const events = data.events || [];
  const tasks = data.tasks || [];
  const leads = data.leads || [];

  let receivablesCount = 0;
  let receivablesAmount = 0;
  let upcomingEvents = 0;

  for (const ev of events) {
    if (isCancelled(ev)) continue;
    const outstanding = Math.max(0, money(ev.amount) - money(ev.paidAmount));
    if (outstanding > 0) {
      receivablesCount += 1;
      receivablesAmount += outstanding;
    }
    const date = parseDateKey(ev.date);
    if (date && date >= today) upcomingEvents += 1;
  }

  return {
    openTasks: tasks.filter((t) => !t.isCompleted).length,
    unhandledLeads: leads.filter((l) => !LOST_LEAD_STATUSES.has(String(l.status || ''))).length,
    upcomingEvents,
    openReceivables: {
      count: receivablesCount,
      amount: Math.round(receivablesAmount * 100) / 100,
    },
  };
}

function countMeta(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0])
  );
}

export const handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'GET') {
    return fail(405, 'Method not allowed');
  }

  const auth = authorize(event);
  if (!auth.ok) return fail(auth.statusCode, auth.error);

  const supabase = getSupabase();
  if (!supabase) return fail(503, 'Database not configured');

  const params = event.queryStringParameters || {};
  const resource = String(params.resource || 'all').trim() || 'all';

  try {
    const requested = resource === 'all'
      ? Array.from(ALLOWED_RESOURCES)
      : resource.split(',').map((r) => r.trim()).filter(Boolean);

    const unknown = requested.filter((r) => !ALLOWED_RESOURCES.has(r));
    if (unknown.length) {
      return fail(400, `Unsupported resource: ${unknown.join(', ')}. Use events, customers, leads, tasks, or all`);
    }

    const data = {};
    for (const item of requested) {
      data[item] = await fetchResource(supabase, item, params);
    }

    const single = requested.length === 1 ? requested[0] : null;
    const payload = single ? data[single] : data;
    const count = single ? payload.length : countMeta(data);

    return ok(payload, {
      count,
      resource: single || 'all',
      filters: {
        from: params.from || null,
        to: params.to || null,
        status: params.status || null,
        paymentStatus: params.paymentStatus || null,
        category: params.category || null,
        limit: clampLimit(params.limit),
      },
      insights: buildInsights(data),
    }, {
      resource: single || 'all',
    });
  } catch (err) {
    logError('crm-data', err);
    return fail(err.statusCode || 500, err.statusCode === 400 ? err.message : 'Database request failed');
  }
};
