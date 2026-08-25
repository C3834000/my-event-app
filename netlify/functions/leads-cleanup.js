import { createClient } from '@supabase/supabase-js';

/**
 * ניקוי יומי של לידים שכבר הפכו ללקוחות / מילאו הזמנת אירוע.
 * התאמה לפי טלפון, מייל או שם. נקרא מ-Netlify Scheduled Functions.
 */

function normalizePhoneKey(phone) {
  let d = String(phone || '').replace(/[^0-9]/g, '');
  if (d.startsWith('972') && d.length >= 11) d = '0' + d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = '0' + d;
  return d;
}

function normalizeEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeNameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default async (request) => {
  let nextRun = null;
  try {
    const body = await request.json();
    nextRun = body?.next_run;
  } catch {
    // קריאה ידנית
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ ok: false, error: 'env' }), { status: 503 });
  }

  const supabase = createClient(url, key);

  const [{ data: leads, error: leadsErr }, { data: customers, error: custErr }, { data: events, error: evErr }] =
    await Promise.all([
      supabase.from('leads').select('id,name,phone,email,status'),
      supabase.from('customers').select('id,name,phone,email'),
      supabase.from('events').select('id,phone,email'),
    ]);

  if (leadsErr || custErr || evErr) {
    const msg = leadsErr?.message || custErr?.message || evErr?.message;
    console.error('[leads-cleanup]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }

  const phoneSet = new Set();
  const emailSet = new Set();
  const nameSet = new Set();

  for (const c of customers || []) {
    const p = normalizePhoneKey(c.phone);
    if (p.length >= 9) phoneSet.add(p);
    const em = normalizeEmailKey(c.email);
    if (em) emailSet.add(em);
    const n = normalizeNameKey(c.name);
    if (n.length >= 2) nameSet.add(n);
  }
  for (const e of events || []) {
    const p = normalizePhoneKey(e.phone);
    if (p.length >= 9) phoneSet.add(p);
    const em = normalizeEmailKey(e.email);
    if (em) emailSet.add(em);
  }

  const toDelete = (leads || []).filter((l) => {
    if (l.status === 'הפך ללקוח' || l.status === 'Converted') return true;
    const p = normalizePhoneKey(l.phone);
    const em = normalizeEmailKey(l.email);
    const n = normalizeNameKey(l.name);
    if (p.length >= 9 && phoneSet.has(p)) return true;
    if (em && emailSet.has(em)) return true;
    if (n.length >= 2 && nameSet.has(n)) return true;
    return false;
  });

  let deleted = 0;
  for (const lead of toDelete) {
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    if (!error) deleted += 1;
    else console.warn('[leads-cleanup] delete failed', lead.id, error.message);
  }

  console.log('[leads-cleanup] deleted', deleted, 'of', toDelete.length, nextRun || '');
  return new Response(JSON.stringify({ ok: true, deleted, candidates: toDelete.length, next_run: nextRun }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
