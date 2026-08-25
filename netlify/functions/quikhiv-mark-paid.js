/**
 * quikhiv-mark-paid — מבצעי קיץ 2026 (אינטגרציה עם עורך החידונים Quikhiv)
 * ─────────────────────────────────────────────────────────────────────────
 * נקרא מטופס ההזמנה (BookingForm) אחרי שליחה מוצלחת, כשהלקוח הגיע מהעורך
 * (פרמטרים quikhivUid / quikhivEmail בקישור). מעביר את הזיהוי לפונקציית
 * הענן crm-mark-paid ב-Supabase של Quikhiv, שמסמנת את הלקוח כמשלם
 * (profiles.is_paid = true) ומשחררת את מגבלת 25 השאלות.
 *
 * env נדרש ב-Netlify: QUIKHIV_MARK_PAID_SECRET (זהה ל-CRM_MARK_PAID_SECRET
 * ב-Supabase של Quikhiv). ללא הסוד — הפונקציה מחזירה 503 ולא שוברת את הטופס.
 */

const QUIKHIV_FUNCTION_URL =
  'https://kpptulrjwxhojgsaajxr.supabase.co/functions/v1/crm-mark-paid';

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

  const secret = process.env.QUIKHIV_MARK_PAID_SECRET;
  if (!secret) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'QUIKHIV_MARK_PAID_SECRET not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const uid = String(body.uid || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  if (!uid && !email && !phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing uid, email or phone' }) };
  }

  try {
    const res = await fetch(QUIKHIV_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-crm-secret': secret },
      body: JSON.stringify({ uid, email, phone }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[quikhiv-mark-paid] uid=${uid || '-'} email=${email || '-'} → ${res.status}`, data);
    return { statusCode: res.ok ? 200 : 502, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('[quikhiv-mark-paid]', err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: err?.message || String(err) }) };
  }
};
