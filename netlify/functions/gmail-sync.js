import { runGmailSync } from './lib/gmailLogic.mjs';

/**
 * מריץ Netlify Scheduled Functions (ראה netlify.toml) וגם נקרא ידנית מהלקוח (כפתור "סנכרן מיילים").
 */
export default async () => {
  const result = await runGmailSync(process.env);
  return new Response(JSON.stringify(result), {
    status: result.statusCode || (result.ok ? 200 : 500),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
