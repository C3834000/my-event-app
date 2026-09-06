// ============================================================================
// סריקה לקריאה בלבד: איתור חשבוניות וקבלות 2025–2026 במחשב.
// - לא מזיז, לא משנה ולא מוחק שום קובץ מקורי.
// - זיהוי לפי שם קובץ/תיקייה + זיהוי תוכן (טקסט מ-PDF) כשאפשר.
// - תאריך נקבע מתוך תוכן המסמך; אם לא ברור — מסומן לבדיקה, בלי ניחוש.
// - כפילויות לפי SHA-256, עם כל המיקומים של כל מסמך.
// - הממצאים נכתבים ל-test-env/scan/ (מוחרג מ-git). אין נתונים אישיים בקוד.
// הרצה: node scripts/scan-invoices.mjs
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch { /* אין חילוץ PDF — נסמן לבדיקה */ }

const OUT_DIR = path.resolve('test-env/scan');
fs.mkdirSync(OUT_DIR, { recursive: true });

const HOME = 'C:/Users/c3834';
const ROOTS = [
  `${HOME}/Documents`,
  `${HOME}/Downloads`,
  `${HOME}/OneDrive`,
  `${HOME}/Pictures`,
  `${HOME}/Music`,
  `${HOME}/Videos`,
  'C:/', // רק תיקיות לא-מערכתיות בשורש (מסונן בהמשך)
];

const SKIP_DIR_NAMES = new Set([
  '$recycle.bin', '$windows.~bt', '$windows.~ws', 'windows', 'program files',
  'program files (x86)', 'programdata', 'perflogs', 'recovery',
  'system volume information', 'esd', 'inetpub', 'ldplayer', 'python314',
  'onedrivetemp', 'appdata', 'node_modules', '.git', 'dist', 'dist-ssr',
  'test-env', 'test-env-live', 'muse hub', 'saved games', 'searches',
  'contacts', 'favorites', 'links', 'users',
]);
const skipDir = (name) => name.startsWith('.') || name.startsWith('$') || SKIP_DIR_NAMES.has(name.toLowerCase());

const DOC_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.heic', '.doc', '.docx', '.xls', '.xlsx']);
const KEYWORD_RE = /(2025|2026|מסמכ|חשבונ|קבל|הוצא|invoice|receipt)/i;

const MAX_DEPTH = 10;
const MAX_PDF_SIZE = 20 * 1024 * 1024;

const files = [];            // { path, name, ext, size, dirHit, nameHit }
const unscannable = [];      // { path, error }
let dirsVisited = 0;

function walk(dir, depth, ancestorHit) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { unscannable.push({ path: dir, error: e.code || String(e) }); return; }
  dirsVisited++;
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (skipDir(ent.name)) continue;
      // בשורש C:/ נכנסים רק לתיקיות שנשארו אחרי הסינון (תיקיות תוכן של המשתמש)
      walk(full, depth + 1, ancestorHit || KEYWORD_RE.test(ent.name));
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (!DOC_EXT.has(ext)) continue;
      const nameHit = KEYWORD_RE.test(ent.name);
      if (!nameHit && !ancestorHit) continue; // רלוונטי רק אם השם או תיקיית-אב רומזים
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      files.push({ path: full.replace(/\\/g, '/'), name: ent.name, ext, size, dirHit: ancestorHit, nameHit });
    }
  }
}

console.log('סורק...');
for (const root of ROOTS) {
  if (root === 'C:/') {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory() || skipDir(ent.name)) continue;
      // בשורש הכונן: רק תיקיות שאינן תיקיות המשתמש (כבר נסרקות) — כלומר תיקיות תוכן בעברית וכד'
      walk(path.join(root, ent.name), 1, KEYWORD_RE.test(ent.name));
    }
  } else {
    walk(root, 0, KEYWORD_RE.test(path.basename(root)));
  }
}
console.log(`נסרקו ${dirsVisited} תיקיות; ${files.length} קבצים מועמדים.`);

// ── hash לכל קובץ + קיבוץ כפילויות ──────────────────────────────────────────
const byHash = new Map();
for (const f of files) {
  try {
    f.hash = crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');
  } catch (e) {
    f.hash = null;
    unscannable.push({ path: f.path, error: e.code || String(e) });
    continue;
  }
  (byHash.get(f.hash) || byHash.set(f.hash, []).get(f.hash)).push(f);
}

// ── זיהוי תוכן: PDF בלבד (אין OCR לתמונות/סריקות) ───────────────────────────
const DATE_RES = [
  /(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/g,   // dd/mm/yyyy
  /(20\d{2})-(\d{1,2})-(\d{1,2})/g,           // yyyy-mm-dd
];
const TYPE_PATTERNS = [
  ['חשבונית מס/קבלה', /חשבונית\s*מס[\s\S]{0,3}?[\/־-]\s*קבלה|חשבונית\s*מס\s*קבלה/],
  ['חשבונית מס', /חשבונית\s*מס|tax\s*invoice/i],
  ['קבלה', /קבלה|receipt/i],
  ['זיכוי', /זיכוי|credit\s*note/i],
  ['חשבון עסקה', /חשבון\s*עסקה|proforma/i],
  ['חשבונית מס', /invoice/i],
];

function detectDates(text) {
  const found = new Set();
  for (const re of DATE_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      let y, mo, d;
      if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else { d = +m[1]; mo = +m[2]; y = +m[3]; }
      if (y >= 2023 && y <= 2027 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        found.add(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
  }
  return [...found];
}

/** תאריך ליד מילת מפתח 'תאריך' — עדיפות ראשונה */
function dateNearKeyword(text) {
  const idx = text.search(/תאריך|הופק ב|נוצר ב|date/i);
  if (idx < 0) return null;
  const win = text.slice(idx, idx + 80);
  const dates = detectDates(win);
  return dates.length === 1 ? dates[0] : null;
}

const uniqueDocs = []; // מסמך לוגי אחד לכל hash
for (const [hash, locs] of byHash) {
  const primary = locs[0];
  const doc = {
    hash,
    locations: locs.map(l => l.path),
    fileName: primary.name,
    ext: primary.ext,
    size: primary.size,
    contentChecked: false,
    docType: null,
    detectedDate: null,      // YYYY-MM-DD מתוך התוכן
    dateStatus: 'unknown',   // 'clear' | 'ambiguous' | 'unknown'
    isInvoiceLike: null,     // true/false/null(לא נבדק תוכן)
    docNumber: null,
    review: [],              // סיבות לבדיקה ידנית
  };

  if (primary.ext === '.pdf' && pdfParse && primary.size <= MAX_PDF_SIZE) {
    try {
      const { text } = await pdfParse(fs.readFileSync(primary.path));
      const t = (text || '').replace(/\u00a0/g, ' ');
      doc.contentChecked = t.trim().length > 20;
      if (doc.contentChecked) {
        for (const [label, re] of TYPE_PATTERNS) {
          if (re.test(t)) { doc.docType = label; break; }
        }
        doc.isInvoiceLike = !!doc.docType;
        const near = dateNearKeyword(t);
        const all = detectDates(t);
        if (near) { doc.detectedDate = near; doc.dateStatus = 'clear'; }
        else if (all.length === 1) { doc.detectedDate = all[0]; doc.dateStatus = 'clear'; }
        else if (all.length > 1) {
          const months = new Set(all.map(d => d.slice(0, 7)));
          if (months.size === 1) { doc.detectedDate = all.sort()[0]; doc.dateStatus = 'clear'; }
          else { doc.dateStatus = 'ambiguous'; doc.review.push(`כמה תאריכים שונים במסמך: ${all.sort().join(', ')}`); }
        } else {
          doc.review.push('לא נמצא תאריך בתוכן');
        }
        const num = t.match(/(?:חשבונית|קבלה|מסמך|מס')\s*(?:מס(?:פר)?\.?|#|:)?\s*(\d{3,10})/);
        if (num) doc.docNumber = num[1];
      } else {
        doc.review.push('PDF סרוק ללא טקסט — נדרש זיהוי ידני (אין OCR)');
      }
    } catch (e) {
      doc.review.push(`חילוץ טקסט נכשל: ${e.message?.slice(0, 60)}`);
    }
  } else if (primary.ext !== '.pdf') {
    doc.review.push('תמונה/מסמך Office — אין זיהוי תוכן אוטומטי, לפי שם בלבד');
  }

  if (locs.length > 1) doc.review.push(`כפילות זהה ב-${locs.length} מיקומים`);
  uniqueDocs.push(doc);
}

// ── דומים אך לא זהים: אותו שם מנורמל, hash שונה ─────────────────────────────
const normName = (n) => n.toLowerCase().replace(/\s*\(\d+\)|\s*-\s*copy|\s*עותק/g, '').trim();
const byName = new Map();
for (const d of uniqueDocs) {
  const k = normName(d.fileName) + '|' + d.ext;
  (byName.get(k) || byName.set(k, []).get(k)).push(d);
}
for (const group of byName.values()) {
  if (group.length > 1) {
    for (const d of group) d.review.push(`דומה-אך-לא-זהה ל-${group.length - 1} קבצים נוספים באותו שם`);
  }
}

// ── סיווג לפי שנה/חודש ──────────────────────────────────────────────────────
const relevant = uniqueDocs.filter(d =>
  d.isInvoiceLike === true ||
  (d.isInvoiceLike === null && (KEYWORD_RE.test(d.fileName) || d.locations.some(p => /חשבונ|קבל|invoice|receipt/i.test(p))))
);
const byMonth = {};
for (const d of relevant) {
  const key = d.dateStatus === 'clear' ? d.detectedDate.slice(0, 7) : 'לבדיקה (תאריך לא ברור)';
  (byMonth[key] ||= []).push(d);
}

// ── כתיבת ממצאים ────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT_DIR, 'findings.json'), JSON.stringify({
  scannedAt: new Date().toISOString(),
  dirsVisited,
  candidates: files.length,
  uniqueByHash: uniqueDocs.length,
  relevantCount: relevant.length,
  unscannable,
  documents: uniqueDocs,
}, null, 1), 'utf8');

const lines = [];
lines.push(`# ממצאי סריקה — ${new Date().toLocaleString('he-IL')}`);
lines.push(`תיקיות שנסרקו: ${dirsVisited} · קבצים מועמדים: ${files.length} · מסמכים ייחודיים (לפי hash): ${uniqueDocs.length}`);
lines.push(`מסמכים רלוונטיים (חשבונית/קבלה לפי תוכן או שם): ${relevant.length}`);
lines.push('');
lines.push('## לפי חודש (תאריך מתוך תוכן המסמך)');
for (const [k, docs] of Object.entries(byMonth).sort()) {
  lines.push(`- ${k}: ${docs.length} מסמכים`);
}
lines.push('');
const dups = uniqueDocs.filter(d => d.locations.length > 1);
lines.push(`## כפילויות זהות (אותו hash בכמה מיקומים): ${dups.length}`);
for (const d of dups.slice(0, 60)) lines.push(`- ${d.fileName}: ${d.locations.join(' ⟷ ')}`);
lines.push('');
lines.push(`## מיקומים שלא ניתן היה לסרוק: ${unscannable.length}`);
for (const u of unscannable.slice(0, 40)) lines.push(`- ${u.path} (${u.error})`);
fs.writeFileSync(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');

console.log(`נכתב: test-env/scan/findings.json + report.md`);
console.log(`ייחודיים: ${uniqueDocs.length} · רלוונטיים: ${relevant.length} · כפילויות: ${dups.length} · חסומים: ${unscannable.length}`);
