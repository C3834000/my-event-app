import { createClient } from '@supabase/supabase-js';

const DATE_FIELDS = new Set(['due_date', 'completed_date', 'reminder_date', 'reminder_date_time', 'follow_up_date', 'follow_up_reminder', 'payment_date', 'last_updated_at']);
const NUM_FIELDS = new Set(['amount', 'paid_amount', 'potential_revenue', 'estimated_time_min', 'progress', 'priority', 'clickers_needed', 'waiting_days', 'ease_of_execution', 'gi_doc_number', 'gi_doc_type']);

/** עמודות שקיימות בטבלת events (camelCase לפני toSnake) — מונע 500 כשה-UI שולח שדות שלא קיימים ב-DB */
const EVENTS_PAYLOAD_KEYS = new Set([
  'id', 'customerId', 'title', 'date', 'startTime', 'endTime', 'amount', 'paidAmount',
  'status', 'paymentStatus', 'eventType', 'clickersNeeded', 'location', 'reminderDateTime',
  'tag', 'category', 'hebrewDate', 'paymentMethod', 'notes', 'externalId', 'phone', 'email',
  'termsAccepted', 'taskId', 'paymentDate', 'invoiceName',
  // Green Invoice document tracking
  'giDocId', 'giDocNumber', 'giDocType', 'giDocDate', 'giDocUrl',
  // סטטוס שליחת חשבונית
  'invoiceSent',
]);

function filterEventsPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => EVENTS_PAYLOAD_KEYS.has(k)));
}

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
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  const { table, action, data, id, orderBy, orderAsc } = body;

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
        const payload = table === 'events' ? filterEventsPayload(data) : data;
        const { data: row, error } = await supabase.from(table).insert([toSnake(payload)]).select().single();
        if (error) throw error;
        result = toCamel(row);
        break;
      }
      case 'update': {
        const payload = table === 'events' ? filterEventsPayload(data) : data;
        const { data: row, error } = await supabase.from(table).update(toSnake(payload)).eq('id', id).select().single();
        if (error) {
          // Row might not exist yet - try upsert instead
          const merged = id ? { ...toSnake(payload), id } : toSnake(payload);
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
        const rows = table === 'events' ? data.map(filterEventsPayload) : data;
        const { error } = await supabase.from(table).upsert(rows.map(toSnake), { onConflict: 'id' });
        if (error) throw error;
        result = { success: true };
        break;
      }
      case 'upsert': {
        const payload = table === 'events' ? filterEventsPayload(data) : data;
        const { data: row, error } = await supabase.from(table).upsert([toSnake(payload)]).select().single();
        if (error) throw error;
        result = toCamel(row);
        break;
      }
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: result }) };
  } catch (err) {
    const message = err?.message || String(err);
    const details = err?.details || err?.hint || '';
    return { statusCode: 500, headers, body: JSON.stringify({ error: message, details }) };
  }
};
