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

const DEFAULT_TAX_SETTINGS = {
  vatDebt: 93465,
  incomeTaxDebt: 28301,
  debtAsOf: '2026-09-07',
};

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

function resolveTaxDebts(settingsData) {
  const stored = settingsData?.taxSettings && typeof settingsData.taxSettings === 'object'
    ? settingsData.taxSettings
    : null;
  const vat = money(stored?.vatDebt ?? DEFAULT_TAX_SETTINGS.vatDebt);
  const incomeTax = money(stored?.incomeTaxDebt ?? DEFAULT_TAX_SETTINGS.incomeTaxDebt);
  return {
    vat,
    incomeTax,
    total: round2(vat + incomeTax),
    asOf: stored?.debtAsOf || DEFAULT_TAX_SETTINGS.debtAsOf,
    source: stored ? 'settings' : 'default',
  };
}

function publicCashflow(snapshot, taxDebts) {
  const s = snapshot.summary;
  return {
    openingBalance: snapshot.openingBalance,
    income: s.totalEventAmount,
    expenses: s.outflowsInRange,
    received: s.receivedInRange,
    paidOut: s.outflowsInRange,
    receivables: s.totalOutstanding,
    overdueReceivables: s.overdueOutstanding,
    undatedReceivables: s.undatedOutstanding,
    payables: 0,
    taxDebts,
    openInvoices: {
      count: snapshot.openBalances.length,
      amount: s.totalOutstanding,
    },
    projectedBalance: s.endingCumulativeGap,
    forecast: {
      expectedCollections: s.expectedDatedInRange,
      scheduledOutflows: s.outflowsInRange,
      undatedOutstanding: s.undatedOutstanding,
      overdueOutstanding: s.overdueOutstanding,
      netGapInRange: s.netGapInRange,
      endingCumulative: s.endingCumulativeGap,
    },
    range: snapshot.range,
    asOf: snapshot.asOf,
    details: {
      expectedCollections: snapshot.expectedCollections,
      receivedPayments: snapshot.receivedPayments,
      openBalances: snapshot.openBalances,
      undatedBalances: snapshot.undatedBalances,
      overdue: snapshot.overdue,
      expenses: snapshot.expenses,
      daily: snapshot.daily,
    },
  };
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
  const asOf = parseDateKey(params.asOf) || todayKey();
  const from = parseDateKey(params.from) || shiftMonths(asOf, -1);
  const to = parseDateKey(params.to) || shiftMonths(asOf, 3);
  const openingBalance = params.openingBalance;

  if (from > to) return fail(400, '`from` must be <= `to`');

  try {
    const [eventsRes, settingsRes] = await Promise.all([
      supabase.from('events').select('*').order('date', { ascending: true }),
      supabase.from('settings').select('*').limit(1),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const settingsRow = toCamel((settingsRes.data || [])[0] || {});
    const settingsData = settingsRow?.data || {};
    const financeEntries = Array.isArray(settingsData.financeEntries)
      ? settingsData.financeEntries
      : [];
    const taxDebts = resolveTaxDebts(settingsData);

    const snapshot = buildCashflowSnapshot({
      events: eventsRes.data || [],
      financeEntries,
      from,
      to,
      openingBalance,
      asOf,
    });

    const data = publicCashflow(snapshot, taxDebts);
    return ok(data, {
      count: {
        events: (eventsRes.data || []).length,
        openInvoices: data.openInvoices.count,
        expenses: snapshot.expenses.length,
      },
      asOf,
      range: { from, to },
    });
  } catch (err) {
    logError('cashflow', err);
    return fail(500, 'Database request failed');
  }
};
