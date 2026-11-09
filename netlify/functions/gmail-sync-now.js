import { runGmailSync } from './lib/gmailLogic.mjs';

/**
 * גרסה "רגילה" (לא מתוזמנת) של סנכרון המיילים — נקראת מהדפדפן (כפתור "סנכרן מיילים" + הסנכרון החי).
 * חייבת להיות פונקציה נפרדת מ-gmail-sync.js: Netlify חוסם קריאות ישירות/ידניות לפונקציה
 * שמוגדרת עם schedule ב-netlify.toml ומחזיר עליה 403 — ה-cron יכול להפעיל אותה, דפדפן לא.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  const result = await runGmailSync(process.env);
  return { statusCode: result.statusCode || (result.ok ? 200 : 500), headers: CORS, body: JSON.stringify(result) };
};
