import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, CircleDollarSign, ClipboardList, Megaphone, Package, Phone, Search, Users } from 'lucide-react';
import { Customer } from '../types';
import { parseEventDateKey } from '../services/eventKpi';
import { buildSecretaryDeskData } from '../services/secretaryDesk';
import SecretaryMail from './SecretaryMail';

type DeskData = ReturnType<typeof buildSecretaryDeskData>;
const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const shortDate = (date?: string) => {
  const key = parseEventDateKey(date);
  if (!key) return 'ללא תאריך';
  const [, month, day] = key.split('-');
  return `${Number(day)}.${Number(month)}`;
};

export const SecretaryStats: React.FC<{ data: DeskData }> = ({ data }) => {
  const cards = [
    { label: 'משימות לטיפול היום', value: data.grouped.urgent.length + data.grouped.today.length, detail: `${data.grouped.stuck.length} ממתינות למשה`, icon: ClipboardList, tone: 'bg-violet-50 text-violet-700' },
    { label: 'לידים לטיפול', value: data.dueLeads.length, detail: `${data.openLeads.length} לידים פתוחים`, icon: Users, tone: 'bg-sky-50 text-sky-700' },
    { label: 'אירועים קרובים', value: data.upcoming.length, detail: 'היום ובשבעת הימים הקרובים', icon: CalendarDays, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'אירועים לגבייה', value: data.debt.length, detail: 'יתרות מאירועים שעברו', icon: CircleDollarSign, tone: 'bg-amber-50 text-amber-700' },
  ];
  return <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{cards.map(card => <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex justify-between gap-2"><span className="text-xs font-bold text-slate-500">{card.label}</span><span className={`rounded-lg p-2 ${card.tone}`}><card.icon size={17} /></span></div><div className="text-2xl font-black text-slate-900 mt-1">{card.value}</div><p className="text-xs text-slate-500 mt-1">{card.detail}</p></div>)}</div>;
};

const Box: React.FC<{ title: string; icon: React.ReactNode; to: string; children: React.ReactNode }> = ({ title, icon, to, children }) => <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-black text-slate-900">{icon}{title}</h2><Link to={to} className="text-xs font-bold text-violet-700 inline-flex items-center gap-1 hover:underline">ללוח המלא <ChevronLeft size={14} /></Link></div>{children}</section>;

export const SecretaryOverview: React.FC<{ data: DeskData; customers: Customer[] }> = ({ data, customers }) => {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('he-IL');
    if (!query) return [];
    return customers.filter(customer => [customer.name, customer.phone, customer.email, customer.companyName].some(value => String(value || '').toLocaleLowerCase('he-IL').includes(query))).slice(0, 5);
  }, [customers, search]);
  const clickers = data.upcoming.reduce((sum, event) => sum + Math.max(0, Number(event.clickersNeeded) || 0), 0);
  return <div className="space-y-4">
    <SecretaryMail />
    <Box title="לקוחות ולידים לטיפול" icon={<Users size={18} className="text-sky-600" />} to="/leads">
      <p className="mt-1 text-xs text-slate-500">לידים חדשים או כאלה שהגיע מועד המעקב שלהם</p>
      {data.dueLeads.length ? <ul className="divide-y divide-slate-100 mt-2">{data.dueLeads.slice(0, 5).map(lead => <li key={lead.id} className="py-3 flex items-center justify-between gap-2"><div className="min-w-0"><p className="font-bold text-sm truncate">{lead.name || 'ללא שם'}</p><p className="text-xs text-slate-500 mt-1">{lead.followUpDate ? `מעקב: ${shortDate(lead.followUpDate)}` : lead.status} {lead.waitingOn ? `· ${lead.waitingOn}` : ''}</p></div>{lead.phone && <a href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`} className="p-2 rounded-lg bg-sky-50 text-sky-700" aria-label={`חיוג אל ${lead.name}`}><Phone size={15} /></a>}</li>)}</ul> : <p className="mt-4 text-sm text-slate-500">אין לידים חדשים או מעקבים שהגיע זמנם.</p>}
    </Box>
    <Box title="אירועים קרובים וציוד" icon={<CalendarDays size={18} className="text-emerald-600" />} to="/events">
      <p className="mt-1 text-xs text-slate-500">היום ובשבעת הימים הקרובים · {data.upcoming.length} אירועים</p>
      {data.upcoming.length ? <ul className="divide-y divide-slate-100 mt-2">{data.upcoming.slice(0, 5).map(event => <li key={event.id}><Link to={`/events?eventId=${encodeURIComponent(event.id)}`} className="block py-3 hover:text-violet-700"><div className="flex justify-between gap-2"><span className="font-bold text-sm">{event.title || 'אירוע ללא שם'}</span><span className="text-xs text-slate-500 shrink-0">{shortDate(event.date)} {event.startTime || ''}</span></div><p className="text-xs text-slate-500 mt-1">{[event.location, Number(event.clickersNeeded) > 0 ? `${event.clickersNeeded} קליקרים` : ''].filter(Boolean).join(' · ') || 'פרטים בלוח האירועים'}</p></Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">אין אירועים רשומים לתקופה הקרובה.</p>}
      {clickers > 0 && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1"><Package size={14} /> סך הדרישה הרשומה: {clickers.toLocaleString('he-IL')} קליקרים באירועים הקרובים</p>}
    </Box>
    <Box title="מעקב גבייה" icon={<CircleDollarSign size={18} className="text-amber-600" />} to="/events">
      <p className="mt-1 text-xs text-slate-500">יתרות לפי נתוני ה־CRM, מאירועים שתאריכם כבר עברו</p>
      {data.debt.length ? <ul className="divide-y divide-slate-100 mt-2">{data.debt.slice(0, 5).map(({ event, customer, amount }) => <li key={event.id}><Link to={`/events?eventId=${encodeURIComponent(event.id)}`} className="py-3 flex justify-between gap-2 hover:text-violet-700"><div className="min-w-0"><p className="text-sm font-bold truncate">{customer?.name || event.title || 'ללא שם'}</p><p className="text-xs text-slate-500 mt-1">{event.title} · {shortDate(event.date)}</p></div><span className="font-black text-sm text-amber-700 shrink-0">{money(amount)}</span></Link></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">לא נמצאו יתרות לאירועים שעברו.</p>}
      {data.debt.length > 0 && <p className="text-xs text-slate-500 mt-2">סה״כ רשום למעקב: {money(data.debt.reduce((sum, item) => sum + item.amount, 0))}</p>}
    </Box>
    <Box title="שיווק" icon={<Megaphone size={18} className="text-pink-600" />} to="/tasks">
      {data.marketing.length ? <><p className="mt-2 text-sm text-slate-600">{data.marketing.length} משימות שיווק פתוחות משויכות למזכירה</p><ul className="mt-2 text-sm text-slate-700 space-y-1">{data.marketing.slice(0, 3).map(task => <li key={task.id}>• {task.title}</li>)}</ul></> : <p className="mt-4 text-sm text-slate-500">אין כרגע משימות שיווק פתוחות המשויכות למזכירה.</p>}
    </Box>
    <Box title="חיפוש לקוח" icon={<Search size={18} className="text-violet-600" />} to="/customers">
      <label htmlFor="secretary-customer-search" className="sr-only">חיפוש לפי שם, טלפון או אימייל</label><input id="secretary-customer-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="שם, טלפון או מייל" className="mt-3 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400" />
      {search.trim() && (results.length ? <ul className="divide-y divide-slate-100">{results.map(customer => <li key={customer.id} className="py-2"><p className="font-bold text-sm">{customer.name}</p><p className="text-xs text-slate-500" dir="auto">{[customer.phone, customer.email].filter(Boolean).join(' · ')}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">לא נמצאו לקוחות תואמים.</p>)}
    </Box>
  </div>;
};
