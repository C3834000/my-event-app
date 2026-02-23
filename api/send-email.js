import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { to, subject, text, html } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ success: false, error: 'Missing to or subject' });
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('Missing SMTP env vars:', { host: !!host, user: !!user, pass: !!pass });
    return res.status(503).json({
      success: false,
      error: 'Email not configured - missing SMTP credentials',
    });
  }

  try {
    console.log('Creating transporter with:', { host, user, port: process.env.SMTP_PORT });
    
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });

    const from = process.env.FROM_EMAIL || user;

    console.log('Sending email to:', to);

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'קליכיף'}" <${from}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
    });

    console.log('Email sent successfully to:', to);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send email error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send email',
    });
  }
}
