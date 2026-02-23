/**
 * שרת קטן לשליחת מיילים.
 * מריצים: cd server && npm install && node index.js
 * משתני סביבה ב-.env (או server/.env): ראה .env.example
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

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
  res.json({ ok: true, emailConfigured: !!getTransporter() });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!getTransporter()) {
    console.warn('Warning: SMTP not configured. Set SMTP_* in server/.env to send emails.');
  }
});
