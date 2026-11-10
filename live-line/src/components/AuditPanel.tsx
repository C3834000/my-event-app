import { useEffect, useState } from 'react';
import { api } from '../api';

type Row = { id: number; at: string; action: string; details: Record<string, unknown>; ip_hash: string | null };

const LABELS: Record<string, string> = {
  login: 'כניסה', login_failed: 'ניסיון כניסה שנכשל', logout: 'יציאה',
  live_mute: 'השתקה', live_unmute: 'פתיחת מיקרופון', live_kick: 'הוצאה מהקו', live_lowerhand: 'הורדת יד', live_raisehand: 'הרמת יד',
  event_create: 'יצירת אירוע', event_update: 'עדכון אירוע', event_activate: 'הפעלת אירוע', event_delete: 'מחיקת אירוע',
  registration_add: 'הוספת נרשם', registration_delete: 'מחיקת נרשם', registration_delete_all: 'מחיקת כל הנרשמים',
  question_create: 'יצירת שאלה', question_update: 'עדכון שאלה', question_delete: 'מחיקת שאלה',
  question_open: 'פתיחת שאלה', question_close: 'סגירת שאלה', trivia_reset: 'איפוס משחק',
};

export default function AuditPanel({ onAuthError }: { onAuthError: (e: unknown) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<Row[]>('admin/audit').then(setRows).catch(onAuthError);
  }, [onAuthError]);

  return (
    <section className="card">
      <h2>יומן פעולות</h2>
      <p className="muted small">כל פעולה בממשק נרשמת. ניסיונות כניסה כושלים מסומנים באדום.</p>
      <table className="table">
        <thead><tr><th>זמן</th><th>פעולה</th><th>פרטים</th><th>מקור (מוצפן)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.action === 'login_failed' ? 'bad-row' : ''}>
              <td>{new Date(r.at).toLocaleString('he-IL')}</td>
              <td>{LABELS[r.action] || r.action}</td>
              <td className="details" dir="ltr">{JSON.stringify(r.details)}</td>
              <td dir="ltr" className="muted small">{r.ip_hash?.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
