import { createClient } from '@supabase/supabase-js';

function toSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v])
  );
}

function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { table, action, data, id, orderBy, orderAsc } = JSON.parse(event.body || '{}');

  if (!table || !action) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing table or action' }) };
  }

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
        if (error) throw error;
        result = toCamel(row);
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
        const { error } = await supabase.from(table).insert(data.map(toSnake));
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
