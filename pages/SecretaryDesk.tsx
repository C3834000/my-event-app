import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckSquare, CircleDollarSign, Mail, Megaphone, RefreshCw, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildSecretaryDeskData, localDateKey } from '../services/secretaryDesk';
import SecretaryCalendar from '../components/SecretaryCalendar';
import SecretaryCollections from '../components/SecretaryCollections';
import SecretaryMail from '../components/SecretaryMail';
import SecretaryTasks from '../components/SecretaryTasks';

type Tab = 'tasks' | 'calendar' | 'collections' | 'mail' | 'info';
const tabs: { id: Tab; label: string; active: string }[] = [
  { id: 'tasks', label: 'משימות', active: 'bg-violet-700' },
  { id: 'calendar', label: 'יומן', active: 'bg-sky-700' },
  { id: 'collections', label: 'גבייה', active: 'bg-amber-700' },
  { id: 'mail', label: 'דואר', active: 'bg-teal-700' },
  { id: 'info', label: 'מידע נוסף', active: 'bg-rose-700' },
];
const SecretaryDesk: React.FC = () => {
  const { tasks, leads, events, customers, cloudSyncOk, lastCloudSyncAt, reloadFromCloud } = useApp();
  const [active, setActive] = useState<Tab>('tasks');
  const [syncError, setSyncError] = useState('');
  const now = new Date();
  const today = localDateKey(now);
  const data = useMemo(() => buildSecretaryDeskData(tasks, leads, events, customers, today), [tasks, leads, events, customers, today]);
  const ready = !!lastCloudSyncAt;
  const status = cloudSyncOk && ready && !syncError ? `מעודכן ${new Date(lastCloudSyncAt!).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : syncError || (ready ? 'החיבור נותק · מוצגים נתונים מהסנכרון האחרון' : 'ממתינים לסנכרון ה־CRM');
  const visible = (tab: Tab) => `${active === tab ? 'block' : 'hidden'} xl:block h-full min-h-0 min-w-0`;
  return <div className="h-full min-h-0 flex flex-col gap-2 overflow-hidden" dir="rtl">
    <header className="shrink-0 rounded-xl bg-slate-900 text-white px-3 py-2 flex items-center justify-between gap-2 mr-11 lg:mr-0">
      <div className="min-w-0"><h1 className="font-black text-base sm:text-lg leading-tight truncate">שולחן המזכירה</h1><p className="text-[10px] sm:text-xs text-slate-300 truncate">{now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} · {status}</p></div>
      <button type="button" onClick={() => { setSyncError(''); void reloadFromCloud().catch(() => setSyncError('הרענון נכשל')); }} className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-slate-200 rounded-lg bg-slate-800 px-2 py-1.5"><RefreshCw size={13} /> רענון</button>
    </header>
    <nav aria-label="אזורי שולחן המזכירה" className="grid grid-cols-5 gap-1 xl:hidden shrink-0">{tabs.map(tab => <button key={tab.id} type="button" onClick={() => setActive(tab.id)} aria-pressed={active === tab.id} className={`rounded-lg px-1 py-1.5 text-[11px] font-bold ${active === tab.id ? `${tab.active} text-white` : 'bg-white text-slate-600 border border-slate-200'}`}>{tab.label}</button>)}</nav>
    <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)_120px] gap-2">
      <div className={visible('tasks')}><SecretaryTasks data={data} today={today} ready={ready} refresh={reloadFromCloud} /></div>
      <div className={visible('calendar')}>{ready ? <SecretaryCalendar events={events} today={today} /> : <section className="h-full rounded-2xl border border-sky-200 bg-sky-50 p-4"><h2 className="font-black text-sky-950">לוח שנה</h2><p className="mt-3 text-sm text-sky-800">ממתינים לסנכרון נתוני ה־CRM…</p></section>}</div>
      <div className={visible('collections')}><SecretaryCollections debt={ready ? data.debt : []} tasks={data.mine} ready={ready} refresh={reloadFromCloud} /></div>
      <div className={visible('mail')}><SecretaryMail /></div>
      <div className={`${visible('info')} xl:col-span-2`}><section className="h-full min-h-0 flex flex-col rounded-2xl border border-rose-200 bg-rose-50 p-3 shadow-sm" aria-labelledby="desk-info-heading"><h2 id="desk-info-heading" className="font-black text-rose-950 flex items-center gap-1 shrink-0"><Users size={17} className="text-rose-700" /> לקוחות, שיווק וציוד</h2><div className="grid grid-cols-3 gap-2 mt-2 min-h-0"><Link to="/leads" className="rounded-lg bg-white/80 p-2 text-xs text-rose-900"><Users size={14} className="inline ml-1" /><strong>{ready ? data.dueLeads.length : '—'}</strong> לידים לטיפול{ready && data.dueLeads[0] && <span className="block truncate text-[10px] text-rose-700 mt-1">{data.dueLeads[0].name}</span>}</Link><Link to="/tasks" className="rounded-lg bg-white/80 p-2 text-xs text-rose-900"><Megaphone size={14} className="inline ml-1" /><strong>{ready ? data.marketing.length : '—'}</strong> משימות שיווק</Link><Link to="/events" className="rounded-lg bg-white/80 p-2 text-xs text-rose-900"><CalendarDays size={14} className="inline ml-1" /><strong>{ready ? data.upcoming.length : '—'}</strong> אירועים קרובים</Link></div><p className="mt-1 text-[10px] text-rose-700 truncate">האירועים הקרובים כוללים גם אירועים הממתינים לאישור. מצב הקליקרים מופיע ביומן.</p></section></div>
    </div>
  </div>;
};
export default SecretaryDesk;
