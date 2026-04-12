import nodemailer from 'nodemailer';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { to, subject, text, html } = JSON.parse(event.body || '{}');

  if (!to || !subject) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing to or subject' }) };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Email not configured on server' }) };
  }

  const port = Number(SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME || 'קליכיף'}" <${FROM_EMAIL || SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
    });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    const message = err.message || String(err);
    const authFailed =
      /Invalid login|535|Authentication failed|EAUTH|bad credentials|Username and Password not accepted/i.test(
        message
      );
    const payload = {
      success: false,
      error: message,
      ...(authFailed && {
        hint:
          'אימות SMTP נכשל. ב-Gmail צריך "סיסמת אפליקציה" (לא סיסמת הגוגל הרגילה), ולעדכן ב-Netlify: Site configuration -> Environment variables -> SMTP_PASS. SMTP_USER = full Gmail. If FROM_EMAIL is set, use same as SMTP_USER. After env changes: Trigger deploy. Gmail needs App Password, not login password.',
      }),
    };
    return { statusCode: 500, headers, body: JSON.stringify(payload) };
  }
};
