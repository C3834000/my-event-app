import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { Task } from '../types';
import {
  ARCHIVE_SUB,
  CATEGORY_COLORS,
  CATEGORY_PALETTE,
  CategoryColor,
  FALLBACK_SUB,
  FALLBACK_TOP,
  TopCategoryConfig,
  getCategoryConfig,
  setCategoryConfig,
} from '../data/taskCategories';

type DraftSub = { key: string; orig?: string; name: string; top: string };

type Props = {
  tasks: Task[];
  updateTask: (id: string, updates: Partial<Task>) => void;
  onClose: () => void;
};

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

const ColorPicker: React.FC<{ value: CategoryColor; onChange: (c: CategoryColor) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1">
    {CATEGORY_COLORS.map((c) => (
      <button
        key={c}
        type="button"
        title={CATEGORY_PALETTE[c].label}
        aria-label={CATEGORY_PALETTE[c].label}
        onClick={() => onChange(c)}
        className={`w-5 h-5 rounded-full ${CATEGORY_PALETTE[c].swatch} ${value === c ? 'ring-2 ring-offset-1 ring-slate-800' : ''}`}
      />
    ))}
  </div>
);

/**
 * ניהול קטגוריות: הוספה, שינוי שם, צבע, סדר ומחיקה של תחומים ראשיים ותתי-קטגוריות.
 * העריכה נעשית בטיוטה ונשמרת רק בלחיצה על «שמור». שינוי שם או מחיקה של תת-קטגוריה
 * מעדכנים גם את המשימות ששייכות אליה.
 */
const CategoryManager: React.FC<Props> = ({ tasks, updateTask, onClose }) => {
  const initial = getCategoryConfig();

  const [tops, setTops] = useState<TopCategoryConfig[]>(() => initial.tops.map((t) => ({ ...t })));
  const [subs, setSubs] = useState<DraftSub[]>(() => {
    const listed = initial.subs.map((s) => ({ key: nextKey(), orig: s.name, name: s.name, top: s.top }));
    // קטגוריות שקיימות במשימות (למשל מייבוא CSV) אבל לא ברשימה — מוצגות תחת «לסיווג»
    const known = new Set(listed.map((s) => s.name));
    const extra = [...new Set<string>(tasks.map((t) => String(t.category || '').trim()))]
      .filter((c) => c && c !== ARCHIVE_SUB && !known.has(c))
      .map((c) => ({ key: nextKey(), orig: c, name: c, top: FALLBACK_TOP }));
    return [...listed, ...extra];
  });
  const [newTopName, setNewTopName] = useState('');
  const [newTopColor, setNewTopColor] = useState<CategoryColor>('teal');
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const taskCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      const c = String(t.category || '').trim();
      m.set(c, (m.get(c) || 0) + 1);
    }
    return m;
  }, [tasks]);

  const countFor = (sub: DraftSub) => (sub.orig ? taskCount.get(sub.orig) || 0 : 0);

  const patchTop = (id: string, patch: Partial<TopCategoryConfig>) =>
    setTops((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const moveTop = (index: number, dir: -1 | 1) =>
    setTops((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const deleteTop = (top: TopCategoryConfig) => {
    if (top.id === FALLBACK_TOP) return;
    const own = subs.filter((s) => s.top === top.id);
    const n = own.reduce((sum, s) => sum + countFor(s), 0);
    const msg = n
      ? `למחוק את «${top.label}»? ${own.length} תתי-קטגוריות ו-${n} משימות יעברו ל«${tops.find((t) => t.id === FALLBACK_TOP)?.label ?? FALLBACK_TOP}».`
      : `למחוק את «${top.label}»?`;
    if (!confirm(msg)) return;
    setTops((prev) => prev.filter((t) => t.id !== top.id));
    setSubs((prev) => prev.map((s) => (s.top === top.id ? { ...s, top: FALLBACK_TOP } : s)));
  };

  const addTop = () => {
    const name = newTopName.trim();
    if (!name) return;
    if (tops.some((t) => t.label === name) || subs.some((s) => s.name === name && s.top !== FALLBACK_TOP)) {
      setError(`כבר יש קטגוריה בשם «${name}»`);
      return;
    }
    const id = tops.some((t) => t.id === name) ? `top_${Date.now()}` : name;
    setTops((prev) => {
      const fallbackAt = prev.findIndex((t) => t.id === FALLBACK_TOP);
      const next = [...prev];
      next.splice(fallbackAt < 0 ? next.length : fallbackAt, 0, { id, label: name, color: newTopColor, defaultSub: name });
      return next;
    });
    setSubs((prev) => {
      // אם קיימת כבר תת-קטגוריה בשם הזה (תחת «לסיווג») — מעבירים אותה לתחום החדש
      if (prev.some((s) => s.name === name)) return prev.map((s) => (s.name === name ? { ...s, top: id } : s));
      return [...prev, { key: nextKey(), name, top: id }];
    });
    setNewTopName('');
    setError(null);
  };

  const addSub = (topId: string) => {
    const name = (newSubName[topId] || '').trim();
    if (!name) return;
    if (name === ARCHIVE_SUB || subs.some((s) => s.name === name)) {
      setError(`כבר יש תת-קטגוריה בשם «${name}»`);
      return;
    }
    setSubs((prev) => [...prev, { key: nextKey(), name, top: topId }]);
    setNewSubName((prev) => ({ ...prev, [topId]: '' }));
    setError(null);
  };

  const deleteSub = (sub: DraftSub) => {
    if (sub.orig === FALLBACK_SUB) return;
    const n = countFor(sub);
    if (n && !confirm(`למחוק את «${sub.name}»? ${n} משימות יעברו ל«${FALLBACK_SUB}».`)) return;
    setSubs((prev) => prev.filter((s) => s.key !== sub.key));
  };

  const save = () => {
    const names = subs.map((s) => s.name.trim());
    if (names.some((n) => !n)) return setError('יש תת-קטגוריה בלי שם');
    if (names.includes(ARCHIVE_SUB)) return setError(`השם «${ARCHIVE_SUB}» שמור`);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return setError(`השם «${dup}» מופיע פעמיים`);
    const labels = tops.map((t) => t.label.trim());
    if (labels.some((l) => !l)) return setError('יש תחום ראשי בלי שם');
    const dupTop = labels.find((n, i) => labels.indexOf(n) !== i);
    if (dupTop) return setError(`התחום «${dupTop}» מופיע פעמיים`);

    // שינויי שם ומחיקות — כדי לעדכן את המשימות
    const renames = new Map<string, string>();
    for (const s of subs) if (s.orig && s.orig !== s.name.trim()) renames.set(s.orig, s.name.trim());
    const kept = new Set(subs.map((s) => s.orig).filter(Boolean) as string[]);
    // כל קטגוריה שמופיעה במשימות נכנסה לטיוטה בפתיחה, אז מה שחסר ממנה עכשיו — נמחק
    const removed = new Set([...taskCount.keys()].filter((c) => c && c !== ARCHIVE_SUB && !kept.has(c)));

    const nextTops = tops.map((t) => ({
      ...t,
      label: t.label.trim(),
      defaultSub: renames.get(t.defaultSub) ?? t.defaultSub,
    }));
    setCategoryConfig({ tops: nextTops, subs: subs.map((s) => ({ name: s.name.trim(), top: s.top })) });

    for (const t of tasks) {
      const c = String(t.category || '').trim();
      if (renames.has(c)) updateTask(t.id, { category: renames.get(c)! });
      else if (removed.has(c)) updateTask(t.id, { category: FALLBACK_SUB });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-black text-slate-800">ניהול קטגוריות</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-800" aria-label="סגור">
            <X size={20} />
          </button>
        </div>
        <p className="px-4 pt-2 text-[11px] text-slate-500 font-medium">
          כל תחום ראשי הוא עמודה בלוח. תתי-קטגוריות הן מה שנבחר במשימה. שינוי שם או מחיקה מעדכנים גם את המשימות.
        </p>

        <div className="overflow-y-auto px-4 py-3 space-y-3 flex-1">
          {tops.map((top, i) => {
            const own = subs.filter((s) => s.top === top.id);
            const palette = CATEGORY_PALETTE[top.color];
            return (
              <div key={top.id} className={`rounded-xl border border-slate-200 border-r-4 ${palette.restBorder} p-3 space-y-2`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    className="flex-1 min-w-[8rem] p-2 bg-slate-50 rounded-lg font-black text-sm outline-none focus:ring-2 focus:ring-sky-200"
                    value={top.label}
                    onChange={(e) => patchTop(top.id, { label: e.target.value })}
                    aria-label="שם התחום"
                  />
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <input
                      type="checkbox"
                      className="accent-slate-700"
                      checked={!!top.hidden}
                      onChange={(e) => patchTop(top.id, { hidden: e.target.checked })}
                    />
                    מוסתר
                  </label>
                  <button type="button" onClick={() => moveTop(i, -1)} disabled={i === 0} className="p-1 text-slate-500 disabled:opacity-30" title="הזז למעלה">
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" onClick={() => moveTop(i, 1)} disabled={i === tops.length - 1} className="p-1 text-slate-500 disabled:opacity-30" title="הזז למטה">
                    <ArrowDown size={15} />
                  </button>
                  {top.id !== FALLBACK_TOP && (
                    <button type="button" onClick={() => deleteTop(top)} className="p-1 text-rose-500 hover:bg-rose-50 rounded" title="מחק תחום">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <ColorPicker value={top.color} onChange={(c) => patchTop(top.id, { color: c })} />

                <div className="space-y-1.5">
                  {own.map((sub) => (
                    <div key={sub.key} className="flex items-center gap-1.5">
                      <input
                        className="flex-1 min-w-0 p-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-sky-300"
                        value={sub.name}
                        disabled={sub.orig === FALLBACK_SUB}
                        onChange={(e) => setSubs((prev) => prev.map((s) => (s.key === sub.key ? { ...s, name: e.target.value } : s)))}
                        aria-label="שם תת-קטגוריה"
                      />
                      <span className="text-[10px] font-bold text-slate-400 shrink-0 w-12 text-center">{countFor(sub)} משימות</span>
                      <select
                        className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 max-w-[7rem]"
                        value={sub.top}
                        disabled={sub.orig === FALLBACK_SUB}
                        onChange={(e) => setSubs((prev) => prev.map((s) => (s.key === sub.key ? { ...s, top: e.target.value } : s)))}
                        aria-label="העבר לתחום"
                      >
                        {tops.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => patchTop(top.id, { defaultSub: sub.name })}
                        className={`text-[10px] font-black px-1.5 py-1 rounded shrink-0 ${top.defaultSub === sub.name ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100'}`}
                        title="ברירת מחדל למשימה חדשה מהתחום"
                      >
                        ברירת מחדל
                      </button>
                      {sub.orig !== FALLBACK_SUB ? (
                        <button type="button" onClick={() => deleteSub(sub)} className="p-1 text-rose-500 hover:bg-rose-50 rounded shrink-0" title="מחק">
                          <X size={14} />
                        </button>
                      ) : (
                        <span className="w-[22px] shrink-0" />
                      )}
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <input
                      className="flex-1 min-w-0 p-1.5 bg-sky-50/60 border border-dashed border-sky-200 rounded-lg text-sm font-bold outline-none placeholder:text-sky-400/80"
                      placeholder="+ תת-קטגוריה חדשה"
                      value={newSubName[top.id] || ''}
                      onChange={(e) => setNewSubName((prev) => ({ ...prev, [top.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSub(top.id);
                        }
                      }}
                    />
                    <button type="button" onClick={() => addSub(top.id)} className="p-1.5 text-sky-600" title="הוסף">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
            <p className="text-xs font-black text-slate-600">תחום ראשי חדש</p>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 p-2 bg-slate-50 rounded-lg font-bold text-sm outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="שם התחום"
                value={newTopName}
                onChange={(e) => setNewTopName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTop();
                  }
                }}
              />
              <button
                type="button"
                onClick={addTop}
                disabled={!newTopName.trim()}
                className="text-sm font-black bg-sky-600 text-white px-3 py-2 rounded-lg disabled:opacity-40 flex items-center gap-1"
              >
                <Plus size={15} /> הוסף
              </button>
            </div>
            <ColorPicker value={newTopColor} onChange={setNewTopColor} />
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="flex-1 bg-sky-600 text-white py-2.5 rounded-xl font-black hover:bg-sky-700">
              שמור
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 font-bold text-slate-500 hover:text-slate-800">
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryManager;
