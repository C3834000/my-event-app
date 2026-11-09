import { runGmailSync } from './lib/gmailLogic.mjs';

/**
 * סנכרון מיילים ברקע (Netlify background function): הדפדפן מקבל 202 מיד, והסנכרון רץ עד ~15 דקות.
 * פונקציה רגילה נחתכת אחרי זמן קצר עם 504, וה-IMAP + הצרופות לוקחים יותר מזה.
 */
export const handler = async () => {
  try {
    const result = await runGmailSync(process.env);
    console.log('gmail-sync-background:', JSON.stringify(result));
  } catch (err) {
    console.error('gmail-sync-background failed:', err?.message || err);
  }
  return { statusCode: 202, body: '' };
};
