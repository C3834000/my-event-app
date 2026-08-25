import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function readBearerToken(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function authorize(event) {
  // Prefer dedicated finance token; fall back to existing GPT read token
  const configured = process.env.CASHFLOW_API_TOKEN || process.env.GPT_READONLY_TOKEN;
  if (!configured) {
    return { ok: false, statusCode: 503, error: 'CASHFLOW_API_TOKEN / GPT_READONLY_TOKEN is not configured' };
  }
  const provided = readBearerToken(event);
  if (!provided || provided !== configured) {
    return { ok: false, statusCode: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

function money(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseDateKey(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftMonths(iso, months) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function eachDate(from, to) {
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    if (!cur) break;
  }
  return out;
}

function isCancelled(ev) {
  const s = String(ev.status || '');
  return s === 'בוטל' || s.toLowerCase() === 'cancelled';
}

function expectedCollectionDate(ev) {
  const explicit = parseDateKey(ev.paymentDate);
  if (explicit) return { date: explicit, source: 'paymentDate' };

  const eventDate = parseDateKey(ev.date);
  if (!eventDate) return { date: null, source: 'none' };

  const ps = String(ev.paymentStatus || '');
  if (ps === 'שוטף + 30') return { date: addDaysIso(eventDate, 30), source: 'net30' };
  if (ps === 'שוטף + 60') return { date: addDaysIso(eventDate, 60), source: 'net60' };
  return { date: null, source: 'undated' };
}

function clampDayInMonth(year, month, day) {
  const last = new Date(year, month, 0).getDate();
  const d = Math.min(Math.max(1, day), last);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function expandFinanceEntries(entries, from, to) {
  const outflows = [];
  for (const entry of entries || []) {
    const amount = money(entry.amount);
    if (amount <= 0) continue;
    const type = entry.type || 'variableExpense';
    const label = entry.label || entry.title || type;
    const baseDate = parseDateKey(entry.date);
    if (!baseDate) continue;

    if (type === 'fixedExpense') {
      const day = Number(baseDate.slice(8, 10)) || 1;
      let y = Number(from.slice(0, 4));
      let m = Number(from.slice(5, 7));
      const endY = Number(to.slice(0, 4));
      const endM = Number(to.slice(5, 7));
      while (y < endY || (y === endY && m <= endM)) {
        const date = clampDayInMonth(y, m, day);
        if (date >= from && date <= to) {
          outflows.push({
            id: `${entry.id || label}-${date}`,
            date,
            amount,
            type,
            label,
            kind: 'expense',
          });
        }
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    } else {
      if (baseDate >= from && baseDate <= to) {
        outflows.push({
          id: entry.id || `${label}-${baseDate}`,
          date: baseDate,
          amount,
          type,
          label,
          kind: type === 'donation' ? 'donation' : 'expense',
        });
      }
    }
  }
  return outflows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

function buildCashflowSnapshot({ events, financeEntries, from, to, openingBalance, asOf }) {
  const expectedCollections = [];
  const receivedPayments = [];
  const openBalances = [];
  const undatedBalances = [];
  const overdue = [];

  let totalEventAmount = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  for (const raw of events || []) {
    const ev = toCamel(raw);
    if (isCancelled(ev)) continue;

    const amount = money(ev.amount);
    const paid = money(ev.paidAmount);
    const outstanding = Math.max(0, amount - paid);
    totalEventAmount += amount;
    totalPaid += paid;
    totalOutstanding += outstanding;

    if (paid > 0) {
      const receivedDate = parseDateKey(ev.paymentDate) || parseDateKey(ev.date);
      if (receivedDate && receivedDate >= from && receivedDate <= to) {
        receivedPayments.push({
          eventId: ev.id,
          title: ev.title || '',
          customerId: ev.customerId || null,
          phone: ev.phone || '',
          date: receivedDate,
          amount: paid,
          eventDate: parseDateKey(ev.date),
          paymentStatus: ev.paymentStatus || '',
          kind: 'received',
        });
      }
    }

    if (outstanding > 0) {
      const expected = expectedCollectionDate(ev);
      const item = {
        eventId: ev.id,
        title: ev.title || '',
        customerId: ev.customerId || null,
        phone: ev.phone || '',
        eventDate: parseDateKey(ev.date),
        amount: outstanding,
        totalAmount: amount,
        paidAmount: paid,
        paymentStatus: ev.paymentStatus || '',
        expectedDate: expected.date,
        expectedSource: expected.source,
      };
      openBalances.push(item);

      if (!expected.date) {
        undatedBalances.push(item);
      } else {
        expectedCollections.push({
          ...item,
          date: expected.date,
          kind: 'expected',
        });
        if (expected.date < asOf) {
          overdue.push({ ...item, date: expected.date, kind: 'overdue' });
        }
      }
    }
  }

  const outflows = expandFinanceEntries(financeEntries, from, to);

  const byDate = new Map();
  for (const d of eachDate(from, to)) {
    byDate.set(d, {
      date: d,
      inflowsExpected: 0,
      inflowsReceived: 0,
      outflows: 0,
      net: 0,
      cumulativeGap: 0,
      items: [],
    });
  }

  for (const row of expectedCollections) {
    if (row.date < from || row.date > to) continue;
    const bucket = byDate.get(row.date);
    if (!bucket) continue;
    bucket.inflowsExpected += row.amount;
    bucket.items.push({
      kind: 'expected',
      eventId: row.eventId,
      title: row.title,
      amount: row.amount,
      paymentStatus: row.paymentStatus,
    });
  }

  for (const row of receivedPayments) {
    const bucket = byDate.get(row.date);
    if (!bucket) continue;
    bucket.inflowsReceived += row.amount;
    bucket.items.push({
      kind: 'received',
      eventId: row.eventId,
      title: row.title,
      amount: row.amount,
      paymentStatus: row.paymentStatus,
    });
  }

  for (const row of outflows) {
    const bucket = byDate.get(row.date);
    if (!bucket) continue;
    bucket.outflows += row.amount;
    bucket.items.push({
      kind: row.kind,
      id: row.id,
      title: row.label,
      amount: row.amount,
      type: row.type,
    });
  }

  let cumulative = money(openingBalance);
  const daily = [];
  for (const d of eachDate(from, to)) {
    const bucket = byDate.get(d);
    // Daily cashflow gap uses expected collections + already-received that day, minus outflows
    const inflow = bucket.inflowsExpected + bucket.inflowsReceived;
    bucket.net = inflow - bucket.outflows;
    cumulative += bucket.net;
    bucket.cumulativeGap = cumulative;
    daily.push({
      date: bucket.date,
      inflowsExpected: round2(bucket.inflowsExpected),
      inflowsReceived: round2(bucket.inflowsReceived),
      outflows: round2(bucket.outflows),
      net: round2(bucket.net),
      cumulativeGap: round2(bucket.cumulativeGap),
      items: bucket.items,
    });
  }

  const expectedInRange = expectedCollections
    .filter((x) => x.date >= from && x.date <= to)
    .reduce((s, x) => s + x.amount, 0);
  const receivedInRange = receivedPayments.reduce((s, x) => s + x.amount, 0);
  const outflowsInRange = outflows.reduce((s, x) => s + x.amount, 0);
  const undatedOutstanding = undatedBalances.reduce((s, x) => s + x.amount, 0);
  const overdueOutstanding = overdue.reduce((s, x) => s + x.amount, 0);

  return {
    generatedAt: new Date().toISOString(),
    asOf,
    range: { from, to },
    openingBalance: money(openingBalance),
    summary: {
      totalEventAmount: round2(totalEventAmount),
      totalPaid: round2(totalPaid),
      totalOutstanding: round2(totalOutstanding),
      expectedDatedInRange: round2(expectedInRange),
      receivedInRange: round2(receivedInRange),
      undatedOutstanding: round2(undatedOutstanding),
      overdueOutstanding: round2(overdueOutstanding),
      outflowsInRange: round2(outflowsInRange),
      netGapInRange: round2(expectedInRange + receivedInRange - outflowsInRange),
      endingCumulativeGap: daily.length ? daily[daily.length - 1].cumulativeGap : round2(money(openingBalance)),
    },
    daily,
    expectedCollections: expectedCollections
      .filter((x) => x.date >= from && x.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount),
    receivedPayments: receivedPayments.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount),
    openBalances: openBalances.sort((a, b) => b.amount - a.amount),
    undatedBalances: undatedBalances.sort((a, b) => b.amount - a.amount),
    overdue: overdue.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount),
    expenses: outflows,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const auth = authorize(event);
  if (!auth.ok) return json(auth.statusCode, { error: auth.error });

  const supabase = getSupabase();
  if (!supabase) return json(503, { error: 'Database not configured' });

  const params = event.queryStringParameters || {};
  const asOf = parseDateKey(params.asOf) || todayKey();
  const from = parseDateKey(params.from) || shiftMonths(asOf, -1);
  const to = parseDateKey(params.to) || shiftMonths(asOf, 3);
  const openingBalance = params.openingBalance;

  if (from > to) return json(400, { error: '`from` must be <= `to`' });

  try {
    const [eventsRes, settingsRes] = await Promise.all([
      supabase.from('events').select('*').order('date', { ascending: true }),
      supabase.from('settings').select('*').limit(1),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const settingsRow = toCamel((settingsRes.data || [])[0] || {});
    const financeEntries = Array.isArray(settingsRow?.data?.financeEntries)
      ? settingsRow.data.financeEntries
      : [];

    const snapshot = buildCashflowSnapshot({
      events: eventsRes.data || [],
      financeEntries,
      from,
      to,
      openingBalance,
      asOf,
    });

    return json(200, snapshot);
  } catch (err) {
    return json(500, { error: err?.message || String(err) });
  }
};
