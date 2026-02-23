/**
 * שירות שליחת מיילים – קורא ל-API של השרת (server).
 * השרת חייב לרוץ (npm run dev:server או node server/index.js) והגדרת SMTP ב-server/.env
 */

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const base = typeof window !== 'undefined' ? '' : 'http://localhost:4000'; // SSR-safe
    const url = `${base}/api/send-email`;
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
      return { success: false, error: data.error || res.statusText };
    }
    return { success: !!data.success, error: data.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
