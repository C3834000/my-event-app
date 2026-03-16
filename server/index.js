/**
 * שרת קטן לשליחת מיילים.
 * מריצים: cd server && npm install && node index.js
 * משתני סביבה ב-.env (או server/.env): ראה .env.example
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true }));
app.use(express.json());

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

// POST /api/send-email
// Body: { to, subject, text?, html? }
app.post('/api/send-email', async (req, res) => {
  const { to, subject, text, html } = req.body || {};
  if (!to || !subject) {
    return res.status(400).json({ success: false, error: 'Missing to or subject' });
  }

  const transporter = getTransporter();
  if (!transporter) {
    return res.status(503).json({
      success: false,
      error: 'Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in server/.env',
    });
  }

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'קליכיף'}" <${from}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, emailConfigured: !!getTransporter(), dbConfigured: !!getSupabase() });
});

// ===== DATABASE PROXY (Supabase) =====

// camelCase → snake_case (top-level keys only)
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

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key);
}

// POST /api/db
app.post('/api/db', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in server/.env' });
  }

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

    res.json({ data: result });
  } catch (err) {
    console.error(`DB [${table}.${action}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!getTransporter()) {
    console.warn('Warning: SMTP not configured. Set SMTP_* in server/.env to send emails.');
  }
});
