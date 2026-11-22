import React, { useEffect, useState } from 'react';
import { Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import SecretaryDialog from './SecretaryDialog';

type UsefulPhone = { id: string; name: string; phone: string };
const STORAGE_KEY = 'secretary_useful_phones_v1';
const DEFAULT_PHONES: UsefulPhone[] = [{ id: 'taxi-union', name: 'איגוד המוניות ושליחויות', phone: '033139038' }];

const readPhones = (): UsefulPhone[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_PHONES;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_PHONES;
    return parsed.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.phone === 'string');
  } catch { return DEFAULT_PHONES; }
};
const dialNumber = (phone: string) => phone.replace(/[^\d+]/g, '');

const SecretaryPhones: React.FC = () => {
  const [phones, setPhones] = useState<UsefulPhone[]>(readPhones);
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<{ phone: UsefulPhone; index: number } | null>(null);

  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY) setPhones(readPhones()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const save = (next: UsefulPhone[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPhones(next);
      setError('');
      return true;
    } catch {
      setError('לא ניתן לשמור מספרים בדפדפן.');
      return false;
    }
  };
  const resetForm = () => { setShowForm(false); setEditingId(null); setName(''); setPhone(''); setError(''); };
  const startEditing = (item?: UsefulPhone) => {
    setEditingId(item?.id || null);
    setName(item?.name || '');
    setPhone(item?.phone || '');
    setError('');
    setShowForm(true);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !/^\+?\d{6,15}$/.test(dialNumber(trimmedPhone))) {
      setError('יש להזין שם ומספר טלפון תקין.');
      return;
    }
    const item = { id: editingId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, name: trimmedName, phone: trimmedPhone };
    const next = editingId ? phones.map(existing => existing.id === editingId ? item : existing) : [...phones, item];
    if (save(next)) { setRemoved(null); resetForm(); }
  };
  const remove = (item: UsefulPhone, index: number) => {
    if (save(phones.filter(existing => existing.id !== item.id))) {
      setRemoved({ phone: item, index });
      if (editingId === item.id) resetForm();
    }
  };
  const undoRemove = () => {
    if (!removed) return;
    const next = [...phones];
    next.splice(Math.min(removed.index, next.length), 0, removed.phone);
    if (save(next)) setRemoved(null);
  };

  return <section className="min-w-0 min-h-0 flex flex-col rounded-lg bg-white/80 p-2 text-rose-900" aria-labelledby="secretary-phones-heading">
    <div className="flex shrink-0 items-center justify-between gap-1">
      <h3 id="secretary-phones-heading" className="min-w-0 text-xs font-bold"><Phone size={14} className="inline ml-1" />טלפונים שימושיים</h3>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="shrink-0 text-[10px] font-bold text-rose-700 underline">ניהול</button>
    </div>
    <div className="min-h-0 overflow-y-auto">
      {phones.length ? phones.map(item => <a key={item.id} href={`tel:${dialNumber(item.phone)}`} className="mt-1 block border-b border-rose-100 pb-1 text-[11px] leading-tight text-rose-800 hover:underline" aria-label={`חיוג אל ${item.name}, ${item.phone}`}>
        <span className="block truncate">{item.name}</span><bdi className="block text-right font-black" dir="ltr">{item.phone}</bdi>
      </a>) : <p className="mt-1 text-[10px]">אפשר להוסיף מספרים בניהול.</p>}
    </div>
    {open && <SecretaryDialog title="טלפונים שימושיים" onClose={() => { setOpen(false); resetForm(); setRemoved(null); }}>
      <p className="text-xs text-slate-500">המספרים נשמרים בדפדפן הזה בלבד.</p>
      {phones.length ? <ul className="mt-3 divide-y divide-slate-100">
        {phones.map((item, index) => <li key={item.id} className="flex items-center gap-2 py-3">
          <a href={`tel:${dialNumber(item.phone)}`} className="min-w-0 flex-1 rounded-lg text-sm hover:text-rose-700" aria-label={`חיוג אל ${item.name}, ${item.phone}`}><span className="block break-words font-bold">{item.name}</span><bdi className="block text-right text-slate-600" dir="ltr">{item.phone}</bdi></a>
          <button type="button" onClick={() => startEditing(item)} aria-label={`עריכת ${item.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button>
          <button type="button" onClick={() => remove(item, index)} aria-label={`מחיקת ${item.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></button>
        </li>)}
      </ul> : <p className="mt-4 text-sm text-slate-500">עדיין אין מספרים ברשימה.</p>}
      {removed && <p role="status" className="mt-2 text-xs text-slate-600">המספר הוסר. <button type="button" onClick={undoRemove} className="font-bold text-rose-700 underline">שחזור</button></p>}
      {!showForm ? <button type="button" onClick={() => startEditing()} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-sm font-bold text-white hover:bg-rose-800"><Plus size={16} /> הוספת מספר</button> : <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-rose-50 p-3">
        <h4 className="text-sm font-bold">{editingId ? 'עריכת מספר' : 'מספר חדש'}</h4>
        <label className="block text-sm font-bold">שם<input value={name} onChange={event => setName(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" /></label>
        <label className="block text-sm font-bold">טלפון<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} required dir="ltr" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-normal" /></label>
        <div className="flex gap-2"><button type="submit" className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-bold text-white hover:bg-rose-800">שמירה</button><button type="button" onClick={resetForm} className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700">ביטול</button></div>
      </form>}
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
    </SecretaryDialog>}
  </section>;
};

export default SecretaryPhones;
