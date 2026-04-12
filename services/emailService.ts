/**
 * שירות שליחת מיילים – קורא ל-API של השרת (server).
 * השרת חייב לרוץ (npm run dev:server או node server/index.js) והגדרת SMTP ב-server/.env
 */

/** הודעה למשתמש אחרי כשל שליחה (כולל רמז כשנכשל אימות SMTP) */
export function formatSendEmailError(error?: string, hint?: string): string {
  const base = (error && error.trim()) || 'שליחת המייל נכשלה';
  return hint ? `${base}\n\n${hint}` : base;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string; hint?: string }> {
  try {
    // ב-Production משתמשים ב-Vercel Function, בפיתוח (אם רץ server מקומי) ניתן להשתמש ב-localhost
    const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
    const url = isProduction ? '/.netlify/functions/send-email' : 'http://localhost:4000/api/send-email';
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      return { success: false, error: data.error || res.statusText, hint: data.hint };
    }
    
    return { success: !!data.success, error: data.error, hint: data.hint };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Email service error:', message);
    return { success: false, error: message };
  }
}
