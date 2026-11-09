import { useSyncExternalStore } from 'react';
import { settingsService } from '../services/supabase';

/**
 * קטגוריות המשימות — ניתנות לעריכה מתוך לוח המשימות.
 *
 * שתי רמות:
 * - תחום ראשי (עמודה בלוח): שם, צבע, מוסתר/גלוי, ותת-קטגוריה ברירת מחדל.
 * - תת-קטגוריה: הערך שנשמר ב-task.category, משויך לתחום ראשי אחד.
 *
 * ההגדרות נשמרות ב-localStorage וב-settings.data.taskCategories בענן.
 */

/** כל מחלקה כתובה במלואה (בלי bg-${color}) כדי שאפשר יהיה לחפש אותה בקוד. */
type CategoryClasses = {
  label: string;
  swatch: string;
  border: string;
  tag: string;
  chip: string;
  chipOn: string;
  bar: string;
  column: string;
  header: string;
  focusSection: string;
  focusBadge: string;
  focusCard: string;
  restBorder: string;
  pill: string;
  pillDone: string;
};

export type CategoryColor =
  | 'blue'
  | 'sky'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'emerald'
  | 'lime'
  | 'amber'
  | 'orange'
  | 'red'
  | 'rose'
  | 'pink'
  | 'fuchsia'
  | 'purple'
  | 'indigo'
  | 'slate';

export const CATEGORY_PALETTE: Record<CategoryColor, CategoryClasses> = {
  blue: {
    label: 'כחול',
    swatch: 'bg-blue-500',
    border: 'border-r-blue-500',
    tag: 'bg-blue-50 text-blue-700',
    chip: 'bg-blue-50 text-blue-800 border-blue-200',
    chipOn: 'bg-blue-600 text-white border-blue-600',
    bar: 'bg-blue-500',
    column: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20',
    header: 'bg-gradient-to-l from-blue-500 to-blue-600',
    focusSection: 'bg-blue-100/60 dark:bg-blue-900/30 border-blue-200',
    focusBadge: 'bg-blue-600 text-white',
    focusCard: 'bg-gradient-to-l from-blue-500 to-blue-700',
    restBorder: 'border-r-blue-500',
    pill: 'bg-blue-100 text-blue-700',
    pillDone: 'bg-blue-600 text-white',
  },
  sky: {
    label: 'תכלת',
    swatch: 'bg-sky-500',
    border: 'border-r-sky-500',
    tag: 'bg-sky-50 text-sky-700',
    chip: 'bg-sky-50 text-sky-800 border-sky-200',
    chipOn: 'bg-sky-600 text-white border-sky-600',
    bar: 'bg-sky-500',
    column: 'border-sky-200 bg-sky-50 dark:bg-sky-900/20',
    header: 'bg-gradient-to-l from-sky-500 to-sky-600',
    focusSection: 'bg-sky-100/60 dark:bg-sky-900/30 border-sky-200',
    focusBadge: 'bg-sky-600 text-white',
    focusCard: 'bg-gradient-to-l from-sky-500 to-sky-700',
    restBorder: 'border-r-sky-500',
    pill: 'bg-sky-100 text-sky-700',
    pillDone: 'bg-sky-600 text-white',
  },
  cyan: {
    label: 'טורקיז',
    swatch: 'bg-cyan-500',
    border: 'border-r-cyan-500',
    tag: 'bg-cyan-50 text-cyan-700',
    chip: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    chipOn: 'bg-cyan-600 text-white border-cyan-600',
    bar: 'bg-cyan-500',
    column: 'border-cyan-200 bg-cyan-50 dark:bg-cyan-900/20',
    header: 'bg-gradient-to-l from-cyan-500 to-cyan-600',
    focusSection: 'bg-cyan-100/60 dark:bg-cyan-900/30 border-cyan-200',
    focusBadge: 'bg-cyan-600 text-white',
    focusCard: 'bg-gradient-to-l from-cyan-500 to-cyan-700',
    restBorder: 'border-r-cyan-500',
    pill: 'bg-cyan-100 text-cyan-700',
    pillDone: 'bg-cyan-600 text-white',
  },
  teal: {
    label: 'ירוק-כחול',
    swatch: 'bg-teal-500',
    border: 'border-r-teal-500',
    tag: 'bg-teal-50 text-teal-700',
    chip: 'bg-teal-50 text-teal-800 border-teal-200',
    chipOn: 'bg-teal-600 text-white border-teal-600',
    bar: 'bg-teal-500',
    column: 'border-teal-200 bg-teal-50 dark:bg-teal-900/20',
    header: 'bg-gradient-to-l from-teal-500 to-teal-600',
    focusSection: 'bg-teal-100/60 dark:bg-teal-900/30 border-teal-200',
    focusBadge: 'bg-teal-600 text-white',
    focusCard: 'bg-gradient-to-l from-teal-500 to-teal-700',
    restBorder: 'border-r-teal-500',
    pill: 'bg-teal-100 text-teal-700',
    pillDone: 'bg-teal-600 text-white',
  },
  green: {
    label: 'ירוק',
    swatch: 'bg-green-500',
    border: 'border-r-green-500',
    tag: 'bg-green-50 text-green-700',
    chip: 'bg-green-50 text-green-800 border-green-200',
    chipOn: 'bg-green-600 text-white border-green-600',
    bar: 'bg-green-500',
    column: 'border-green-200 bg-green-50 dark:bg-green-900/20',
    header: 'bg-gradient-to-l from-green-500 to-green-600',
    focusSection: 'bg-green-100/60 dark:bg-green-900/30 border-green-200',
    focusBadge: 'bg-green-600 text-white',
    focusCard: 'bg-gradient-to-l from-green-500 to-green-700',
    restBorder: 'border-r-green-500',
    pill: 'bg-green-100 text-green-700',
    pillDone: 'bg-green-600 text-white',
  },
  emerald: {
    label: 'אמרלד',
    swatch: 'bg-emerald-500',
    border: 'border-r-emerald-500',
    tag: 'bg-emerald-50 text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    chipOn: 'bg-emerald-600 text-white border-emerald-600',
    bar: 'bg-emerald-500',
    column: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20',
    header: 'bg-gradient-to-l from-emerald-500 to-emerald-600',
    focusSection: 'bg-emerald-100/60 dark:bg-emerald-900/30 border-emerald-200',
    focusBadge: 'bg-emerald-600 text-white',
    focusCard: 'bg-gradient-to-l from-emerald-500 to-emerald-700',
    restBorder: 'border-r-emerald-500',
    pill: 'bg-emerald-100 text-emerald-700',
    pillDone: 'bg-emerald-600 text-white',
  },
  lime: {
    label: 'ליים',
    swatch: 'bg-lime-500',
    border: 'border-r-lime-500',
    tag: 'bg-lime-50 text-lime-700',
    chip: 'bg-lime-50 text-lime-800 border-lime-200',
    chipOn: 'bg-lime-600 text-white border-lime-600',
    bar: 'bg-lime-500',
    column: 'border-lime-200 bg-lime-50 dark:bg-lime-900/20',
    header: 'bg-gradient-to-l from-lime-500 to-lime-600',
    focusSection: 'bg-lime-100/60 dark:bg-lime-900/30 border-lime-200',
    focusBadge: 'bg-lime-600 text-white',
    focusCard: 'bg-gradient-to-l from-lime-500 to-lime-700',
    restBorder: 'border-r-lime-500',
    pill: 'bg-lime-100 text-lime-700',
    pillDone: 'bg-lime-600 text-white',
  },
  amber: {
    label: 'ענבר',
    swatch: 'bg-amber-500',
    border: 'border-r-amber-500',
    tag: 'bg-amber-50 text-amber-800',
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    chipOn: 'bg-amber-500 text-white border-amber-500',
    bar: 'bg-amber-500',
    column: 'border-amber-200 bg-amber-50 dark:bg-amber-900/20',
    header: 'bg-gradient-to-l from-amber-500 to-amber-600',
    focusSection: 'bg-amber-100/60 dark:bg-amber-900/30 border-amber-200',
    focusBadge: 'bg-amber-600 text-white',
    focusCard: 'bg-gradient-to-l from-amber-500 to-amber-700',
    restBorder: 'border-r-amber-500',
    pill: 'bg-amber-100 text-amber-700',
    pillDone: 'bg-amber-600 text-white',
  },
  orange: {
    label: 'כתום',
    swatch: 'bg-orange-500',
    border: 'border-r-orange-500',
    tag: 'bg-orange-50 text-orange-700',
    chip: 'bg-orange-50 text-orange-800 border-orange-200',
    chipOn: 'bg-orange-600 text-white border-orange-600',
    bar: 'bg-orange-500',
    column: 'border-orange-200 bg-orange-50 dark:bg-orange-900/20',
    header: 'bg-gradient-to-l from-orange-500 to-orange-600',
    focusSection: 'bg-orange-100/60 dark:bg-orange-900/30 border-orange-200',
    focusBadge: 'bg-orange-600 text-white',
    focusCard: 'bg-gradient-to-l from-orange-500 to-orange-700',
    restBorder: 'border-r-orange-500',
    pill: 'bg-orange-100 text-orange-700',
    pillDone: 'bg-orange-600 text-white',
  },
  red: {
    label: 'אדום',
    swatch: 'bg-red-500',
    border: 'border-r-red-500',
    tag: 'bg-red-50 text-red-700',
    chip: 'bg-red-50 text-red-800 border-red-200',
    chipOn: 'bg-red-600 text-white border-red-600',
    bar: 'bg-red-500',
    column: 'border-red-200 bg-red-50 dark:bg-red-900/20',
    header: 'bg-gradient-to-l from-red-500 to-red-600',
    focusSection: 'bg-red-100/60 dark:bg-red-900/30 border-red-200',
    focusBadge: 'bg-red-600 text-white',
    focusCard: 'bg-gradient-to-l from-red-500 to-red-700',
    restBorder: 'border-r-red-500',
    pill: 'bg-red-100 text-red-700',
    pillDone: 'bg-red-600 text-white',
  },
  rose: {
    label: 'ורוד-אדום',
    swatch: 'bg-rose-500',
    border: 'border-r-rose-500',
    tag: 'bg-rose-50 text-rose-700',
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
    chipOn: 'bg-rose-600 text-white border-rose-600',
    bar: 'bg-rose-500',
    column: 'border-rose-200 bg-rose-50 dark:bg-rose-900/20',
    header: 'bg-gradient-to-l from-rose-500 to-rose-600',
    focusSection: 'bg-rose-100/60 dark:bg-rose-900/30 border-rose-200',
    focusBadge: 'bg-rose-600 text-white',
    focusCard: 'bg-gradient-to-l from-rose-500 to-rose-700',
    restBorder: 'border-r-rose-500',
    pill: 'bg-rose-100 text-rose-700',
    pillDone: 'bg-rose-600 text-white',
  },
  pink: {
    label: 'ורוד',
    swatch: 'bg-pink-500',
    border: 'border-r-pink-500',
    tag: 'bg-pink-50 text-pink-700',
    chip: 'bg-pink-50 text-pink-800 border-pink-200',
    chipOn: 'bg-pink-600 text-white border-pink-600',
    bar: 'bg-pink-500',
    column: 'border-pink-200 bg-pink-50 dark:bg-pink-900/20',
    header: 'bg-gradient-to-l from-pink-500 to-pink-600',
    focusSection: 'bg-pink-100/60 dark:bg-pink-900/30 border-pink-200',
    focusBadge: 'bg-pink-600 text-white',
    focusCard: 'bg-gradient-to-l from-pink-500 to-pink-700',
    restBorder: 'border-r-pink-500',
    pill: 'bg-pink-100 text-pink-700',
    pillDone: 'bg-pink-600 text-white',
  },
  fuchsia: {
    label: 'פוקסיה',
    swatch: 'bg-fuchsia-500',
    border: 'border-r-fuchsia-500',
    tag: 'bg-fuchsia-50 text-fuchsia-700',
    chip: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
    chipOn: 'bg-fuchsia-600 text-white border-fuchsia-600',
    bar: 'bg-fuchsia-500',
    column: 'border-fuchsia-200 bg-fuchsia-50 dark:bg-fuchsia-900/20',
    header: 'bg-gradient-to-l from-fuchsia-500 to-fuchsia-600',
    focusSection: 'bg-fuchsia-100/60 dark:bg-fuchsia-900/30 border-fuchsia-200',
    focusBadge: 'bg-fuchsia-600 text-white',
    focusCard: 'bg-gradient-to-l from-fuchsia-500 to-fuchsia-700',
    restBorder: 'border-r-fuchsia-500',
    pill: 'bg-fuchsia-100 text-fuchsia-700',
    pillDone: 'bg-fuchsia-600 text-white',
  },
  purple: {
    label: 'סגול',
    swatch: 'bg-purple-500',
    border: 'border-r-purple-500',
    tag: 'bg-purple-50 text-purple-700',
    chip: 'bg-purple-50 text-purple-800 border-purple-200',
    chipOn: 'bg-purple-600 text-white border-purple-600',
    bar: 'bg-purple-500',
    column: 'border-purple-200 bg-purple-50 dark:bg-purple-900/20',
    header: 'bg-gradient-to-l from-purple-500 to-purple-600',
    focusSection: 'bg-purple-100/60 dark:bg-purple-900/30 border-purple-200',
    focusBadge: 'bg-purple-600 text-white',
    focusCard: 'bg-gradient-to-l from-purple-500 to-purple-700',
    restBorder: 'border-r-purple-500',
    pill: 'bg-purple-100 text-purple-700',
    pillDone: 'bg-purple-600 text-white',
  },
  indigo: {
    label: 'אינדיגו',
    swatch: 'bg-indigo-500',
    border: 'border-r-indigo-500',
    tag: 'bg-indigo-50 text-indigo-700',
    chip: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    chipOn: 'bg-indigo-600 text-white border-indigo-600',
    bar: 'bg-indigo-500',
    column: 'border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20',
    header: 'bg-gradient-to-l from-indigo-500 to-indigo-600',
    focusSection: 'bg-indigo-100/60 dark:bg-indigo-900/30 border-indigo-200',
    focusBadge: 'bg-indigo-600 text-white',
    focusCard: 'bg-gradient-to-l from-indigo-500 to-indigo-700',
    restBorder: 'border-r-indigo-500',
    pill: 'bg-indigo-100 text-indigo-700',
    pillDone: 'bg-indigo-600 text-white',
  },
  slate: {
    label: 'אפור',
    swatch: 'bg-slate-500',
    border: 'border-r-slate-400',
    tag: 'bg-slate-50 text-slate-700',
    chip: 'bg-slate-50 text-slate-800 border-slate-200',
    chipOn: 'bg-slate-600 text-white border-slate-600',
    bar: 'bg-slate-400',
    column: 'border-slate-200 bg-slate-50 dark:bg-slate-900/20',
    header: 'bg-gradient-to-l from-slate-500 to-slate-600',
    focusSection: 'bg-slate-100/60 dark:bg-slate-900/30 border-slate-200',
    focusBadge: 'bg-slate-600 text-white',
    focusCard: 'bg-gradient-to-l from-slate-500 to-slate-700',
    restBorder: 'border-r-slate-500',
    pill: 'bg-slate-100 text-slate-700',
    pillDone: 'bg-slate-600 text-white',
  },
};


export const CATEGORY_COLORS = Object.keys(CATEGORY_PALETTE) as CategoryColor[];

export type TopCategoryId = string;

export type TopCategoryConfig = {
  id: TopCategoryId;
  label: string;
  color: CategoryColor;
  /** מוסתר מהלוח אלא אם מסמנים «הצג מוסתרים» */
  hidden?: boolean;
  /** תת-קטגוריה שמשימה חדשה מקבלת כשמוסיפים אותה מתוך התחום */
  defaultSub: string;
};

export type SubCategoryConfig = { name: string; top: TopCategoryId };

export type CategoryConfig = {
  tops: TopCategoryConfig[];
  subs: SubCategoryConfig[];
};

export type TopCategoryMeta = Omit<CategoryClasses, 'label'> & TopCategoryConfig;

/** תחום «לסיווג» — יעד לכל קטגוריה לא מוכרת. אי אפשר למחוק אותו. */
export const FALLBACK_TOP: TopCategoryId = 'לסיווג';
export const FALLBACK_SUB = 'לסיווג';
/** «ארכיון» מוסתר תמיד ואינו ניתן לעריכה */
export const ARCHIVE_SUB = 'ארכיון';

const DEFAULT_CONFIG: CategoryConfig = {
  tops: [
    { id: 'קליכיף', label: 'קליכיף', color: 'blue', defaultSub: 'קליכיף' },
    { id: 'כספים', label: 'כספים', color: 'green', defaultSub: 'כספים' },
    { id: 'מתיקין', label: 'מתיקין', color: 'purple', defaultSub: 'מתיקין' },
    { id: 'בית ומשפחה', label: 'בית ומשפחה', color: 'orange', defaultSub: 'בית' },
    { id: 'אישי', label: 'אישי', color: 'amber', defaultSub: 'אישי' },
    { id: 'רעיונות', label: 'רעיונות', color: 'slate', hidden: true, defaultSub: 'רעיונות' },
    { id: 'לסיווג', label: 'לסיווג', color: 'rose', defaultSub: 'לסיווג' },
  ],
  subs: [
    { name: 'קליכיף', top: 'קליכיף' },
    { name: 'קליכיף שוטף', top: 'קליכיף' },
    { name: 'קליכיף שיווק', top: 'קליכיף' },
    { name: 'שיווק', top: 'קליכיף' },
    { name: 'תוכנית מדע', top: 'קליכיף' },
    { name: 'תוכנה', top: 'קליכיף' },
    { name: 'קליקלייט', top: 'לסיווג' },
    { name: 'וידאו', top: 'לסיווג' },
    { name: 'משחקים', top: 'לסיווג' },
    { name: 'תוכנית קיץ', top: 'לסיווג' },
    { name: 'תוכן', top: 'לסיווג' },
    { name: 'אירועים', top: 'לסיווג' },
    { name: 'מערכת', top: 'לסיווג' },
    { name: 'כספים', top: 'כספים' },
    { name: 'מתיקין', top: 'מתיקין' },
    { name: 'בית', top: 'בית ומשפחה' },
    { name: 'בית ומשפחה', top: 'בית ומשפחה' },
    { name: 'חתונה', top: 'בית ומשפחה' },
    { name: 'משפחה', top: 'בית ומשפחה' },
    { name: 'אישי', top: 'אישי' },
    { name: 'רעיונות', top: 'רעיונות' },
    { name: 'שיחות', top: 'לסיווג' },
    { name: 'תפעול', top: 'לסיווג' },
    { name: 'ציוד', top: 'לסיווג' },
    { name: 'כללי', top: 'לסיווג' },
    { name: 'דחוף', top: 'לסיווג' },
    { name: 'דחוף / לסיווג', top: 'לסיווג' },
    { name: 'לסיווג', top: 'לסיווג' },
  ],
};

const STORAGE_KEY = 'tasks-category-config-v1';

const isColor = (c: unknown): c is CategoryColor => typeof c === 'string' && c in CATEGORY_PALETTE;

/** מתקן הגדרות פגומות: שמות ייחודיים, תחום «לסיווג» קיים, שיוכים תקינים. */
export function normalizeCategoryConfig(raw: unknown): CategoryConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<CategoryConfig>;
  const tops: TopCategoryConfig[] = [];
  const seenTop = new Set<string>();
  for (const t of Array.isArray(src.tops) ? src.tops : []) {
    const id = String(t?.id ?? '').trim();
    if (!id || seenTop.has(id)) continue;
    seenTop.add(id);
    tops.push({
      id,
      label: String(t.label ?? '').trim() || id,
      color: isColor(t.color) ? t.color : 'slate',
      hidden: !!t.hidden,
      defaultSub: String(t.defaultSub ?? '').trim(),
    });
  }
  if (!tops.length) tops.push(...DEFAULT_CONFIG.tops.map((t) => ({ ...t })));
  if (!seenTop.has(FALLBACK_TOP) && !tops.some((t) => t.id === FALLBACK_TOP)) {
    tops.push({ id: FALLBACK_TOP, label: 'לסיווג', color: 'rose', defaultSub: FALLBACK_SUB });
  }
  const topIds = new Set(tops.map((t) => t.id));

  const subs: SubCategoryConfig[] = [];
  const seenSub = new Set<string>();
  for (const s of Array.isArray(src.subs) ? src.subs : []) {
    const name = String(s?.name ?? '').trim();
    if (!name || name === ARCHIVE_SUB || seenSub.has(name)) continue;
    seenSub.add(name);
    subs.push({ name, top: topIds.has(s.top) ? s.top : FALLBACK_TOP });
  }
  if (!seenSub.has(FALLBACK_SUB)) subs.push({ name: FALLBACK_SUB, top: FALLBACK_TOP });

  for (const t of tops) {
    const own = subs.filter((s) => s.top === t.id);
    if (!own.some((s) => s.name === t.defaultSub)) {
      t.defaultSub = own[0]?.name ?? FALLBACK_SUB;
    }
  }
  return { tops, subs };
}

const readLocal = (): CategoryConfig | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeCategoryConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

let config: CategoryConfig = readLocal() ?? normalizeCategoryConfig(DEFAULT_CONFIG);
let metaCache: TopCategoryMeta[] | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  metaCache = null;
  listeners.forEach((l) => l());
};

const writeLocal = (next: CategoryConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage לא זמין — ההגדרות יישמרו רק בענן
  }
};

export function getCategoryConfig(): CategoryConfig {
  return config;
}

/** שומר הגדרות חדשות מקומית ובענן. */
export function setCategoryConfig(next: CategoryConfig): void {
  config = normalizeCategoryConfig(next);
  writeLocal(config);
  emit();
  const saved = config;
  void (async () => {
    try {
      const s = await settingsService.get();
      const data = { ...(s?.data || {}), taskCategories: saved };
      await settingsService.update({ data });
    } catch (e) {
      console.warn('☁️ שמירת קטגוריות לענן:', (e as Error).message);
    }
  })();
}

let cloudLoaded = false;
/** טוען פעם אחת את ההגדרות מהענן (אם נשמרו שם) ומחליף את המקומיות. */
export async function loadCategoryConfigFromCloud(): Promise<void> {
  if (cloudLoaded) return;
  cloudLoaded = true;
  try {
    const s = await settingsService.get();
    const remote = s?.data?.taskCategories;
    if (!remote) return;
    const next = normalizeCategoryConfig(remote);
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    writeLocal(config);
    emit();
  } catch {
    cloudLoaded = false;
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** מרנדר מחדש את הרכיב כשהקטגוריות משתנות. */
export function useCategoryConfig(): CategoryConfig {
  return useSyncExternalStore(subscribe, getCategoryConfig, getCategoryConfig);
}

export function getTopCategories(): TopCategoryMeta[] {
  if (!metaCache) {
    metaCache = config.tops.map((t) => {
      const { label: _colorName, ...classes } = CATEGORY_PALETTE[t.color];
      return { ...classes, ...t };
    });
  }
  return metaCache;
}

/** כל התת-קטגוריות לבחירה במשימה (בלי «ארכיון»), לפי סדר התחומים. */
export function getTaskCategories(): string[] {
  const order = new Map(config.tops.map((t, i) => [t.id, i]));
  return [...config.subs]
    .sort((a, b) => (order.get(a.top) ?? 0) - (order.get(b.top) ?? 0))
    .map((s) => s.name);
}

/** תחום ראשי לתצוגה. קטגוריה לא מוכרת נופלת ל«לסיווג». «ארכיון» מוסתר. */
export function getTopCategory(cat: string | undefined | null): TopCategoryId | 'hidden' {
  const key = (cat || '').trim();
  if (!key) return FALLBACK_TOP;
  if (key === ARCHIVE_SUB) return 'hidden';
  return config.subs.find((s) => s.name === key)?.top ?? FALLBACK_TOP;
}

export function topCategoryMeta(id: TopCategoryId): TopCategoryMeta {
  const all = getTopCategories();
  return all.find((c) => c.id === id) ?? all.find((c) => c.id === FALLBACK_TOP) ?? all[all.length - 1];
}

export function isHiddenTop(id: TopCategoryId | 'hidden'): boolean {
  if (id === 'hidden') return true;
  return !!config.tops.find((t) => t.id === id)?.hidden;
}
