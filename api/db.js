import { createClient } from '@supabase/supabase-js';

// camelCase → snake_case (top-level keys only, so nested JSONB values are untouched)
function toSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v])
  );
}

// snake_case → camelCase (top-level keys only)
function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Database not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in environment variables.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { table, action, data, id, orderBy, orderAsc } = req.body || {};

  if (!table || !action) {
    return res.status(400).json({ error: 'Missing required fields: table, action' });
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
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(200).json({ data: result });
  } catch (err) {
    console.error(`DB [${table}.${action}]:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
