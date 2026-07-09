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

/**
 * ניקוי כתובת מייל מתווים בלתי-נראים (סימני כיווניות RTL/LTR וכו')
 * שנדבקים בהעתקה מוואטסאפ/מסמכים וגורמים לדומיין להישלח כ-Punycode שגוי (xn--...).
 */
export function sanitizeEmailAddress(value: string): string {
  return String(value || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF\u00A0]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string; hint?: string }> {
  try {
    const cleanTo = Array.isArray(params.to)
      ? params.to.map(sanitizeEmailAddress).filter(Boolean)
      : sanitizeEmailAddress(params.to);
    // ב-Production משתמשים ב-Vercel Function, בפיתוח (אם רץ server מקומי) ניתן להשתמש ב-localhost
    const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
    const url = isProduction ? '/.netlify/functions/send-email' : 'http://localhost:4000/api/send-email';
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: cleanTo,
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      const errText = data.error || res.statusText;
      const notConfigured = res.status === 503 || /not configured/i.test(String(errText));
      return {
        success: false,
        error: errText,
        hint: data.hint || (notConfigured
          ? 'ב-Netlify: Site configuration → Environment variables — יש להגדיר SMTP_HOST, SMTP_USER, SMTP_PASS (למשל Gmail: smtp.gmail.com, פורט 587). אחרי שמירה: Trigger deploy מחדש.'
          : undefined),
      };
    }
    
    return { success: !!data.success, error: data.error, hint: data.hint };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Email service error:', message);
    return { success: false, error: message };
  }
}
