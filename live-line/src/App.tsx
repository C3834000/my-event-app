import Register from './pages/Register';
import Admin from './pages/Admin';

// ניתוב פשוט לפי הכתובת — בלי ספריות נוספות
export default function App() {
  const path = window.location.pathname;
  const reg = path.match(/^\/r\/([a-z0-9-]{4,40})\/?$/);
  if (reg) return <Register slug={reg[1]} />;
  if (path === '/admin' || path.startsWith('/admin/')) return <Admin />;
  return (
    <main className="center-page">
      <div className="card narrow">
        <h1>קו חי</h1>
        <p className="muted">להרשמה לאירוע השתמשו בקישור שקיבלתם מהמארגנים.</p>
      </div>
    </main>
  );
}
