import { createClient } from '@supabase/supabase-js';

const DATE_FIELDS = new Set(['due_date', 'completed_date', 'reminder_date', 'reminder_date_time', 'follow_up_date', 'follow_up_reminder', 'payment_date', 'last_updated_at']);
const NUM_FIELDS = new Set(['amount', 'paid_amount', 'potential_revenue', 'estimated_time_min', 'progress', 'priority', 'clickers_needed', 'waiting_days', 'ease_of_execution']);

function cleanRecord(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined) {
      result[k] = (DATE_FIELDS.has(k) || NUM_FIELDS.has(k)) ? null : null;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function toSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const snaked = Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v])
  );
  return cleanRecord(snaked);
}

function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

function formatError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || err.error_description || String(err);
  const extra = [err.details, err.hint].filter(Boolean).join(' | ');
  const code = err.code ? ` [${err.code}]` : '';
  return extra ? `${msg}${code} — ${extra}` : `${msg}${code}`;
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Database not configured',
        hint: 'ב-Netlify הוסף משתני סביבה (כל ה-deploy contexts): SUPABASE_URL + SUPABASE_ANON_KEY, או VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY — ערכים מ-Supabase → Project Settings → API. אחרי שמירה: Trigger deploy.',
      }),
    };
  }

  const { table, action, data, id, orderBy, orderAsc } = body;

  if (!table || !action) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing table or action' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let result;

    switch (action) {
      case 'getAll': {
        const orderCol = orderBy ? orderBy.replace(/[A-Z]/g, c => '_' + c.toLowerCase()) : null;
        let q = supabase.from(table).select('*');
        if (orderCol) q = q.order(orderCol, { ascending: orderAsc !== false });
        const { data: rows, error } = await q;
        if (error) throw error;
        result = (rows || []).map(toCamel);
        break;
      }
      case 'create': {
        const { data: row, error } = await supabase.from(table).insert([toSnake(data)]).select().single();
        if (error) throw error;
        result = toCamel(row);
        break;
      }
      case 'update': {
        const { data: row, error } = await supabase.from(table).update(toSnake(data)).eq('id', id).select().single();
        if (error) {
          const merged = id ? { ...toSnake(data), id } : toSnake(data);
          const { data: upserted, error: upsertError } = await supabase.from(table).upsert([merged]).select().single();
          if (upsertError) throw upsertError;
          result = toCamel(upserted);
        } else {
          result = toCamel(row);
        }
        break;
      }
      case 'delete': {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        result = { success: true };
        break;
      }
      case 'bulkInsert': {
        if (!Array.isArray(data) || data.length === 0) { result = { success: true }; break; }
        const { error } = await supabase.from(table).upsert(data.map(toSnake), { onConflict: 'id' });
        if (error) throw error;
        result = { success: true };
        break;
      }
      case 'upsert': {
        const { data: row, error } = await supabase.from(table).upsert([toSnake(data)]).select().single();
        if (error) throw error;
        result = toCamel(row);
        break;
      }
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: result }) };
  } catch (err) {
    console.error('[db]', action, table, err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: formatError(err),
        hint: /relation|does not exist|42P01/i.test(formatError(err))
          ? 'הרץ ב-Supabase את CREATE_TABLES.sql (או המיגרציות) כדי ליצור את הטבלאות.'
          : undefined,
      }),
    };
  }
};
