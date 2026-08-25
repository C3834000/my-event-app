const fs = require('fs');
const path = require('path');

const input = path.join(__dirname, 'events_live.json');

const events = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));

const PAID = new Set([
  'שולם',
  'שולם - מזומן',
  "שולם העברה ל'",
  'שולם - אשראי',
  "שולם -צ'ק",
  "שולם - העברה ח'",
  "שולם - העברה מ'",
  'שולם לספק אלזס / קו...',
]);

const knownTags = new Set([
  'קליכיף',
  'יתרון ירושלמי',
  'גפן תשפ״ה',
  'גפן תשפ"ה',
  'גפן תשפ״ד',
  'גפן תשפ"ד',
  'פידבק',
  'זה״ב - עיריית י-ם',
  'זה"ב - עיריית י-ם',
  'מרכז הבמה',
  'חיות דקדושה',
  'לבדיקה',
]);

const num = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
};

const normalizeTag = (tag) =>
  String(tag || '')
    .replace(/["״]/g, '״')
    .trim();

const canonicalTag = (tag) => {
  const t = normalizeTag(tag);
  if (!t) return '';
  if (t.includes('גפן') && t.includes('תשפ') && t.includes('ה')) return 'גפן תשפ״ה';
  if (t.includes('גפן') && t.includes('תשפ') && t.includes('ד')) return 'גפן תשפ״ד';
  if (t.includes('זה') && t.includes('ב') && (t.includes('י-ם') || t.includes('ירושל'))) return 'זה״ב - עיריית י-ם';
  if (t === 'קליכיף' || t.includes('קליכיף')) return 'קליכיף';
  if (t.includes('יתרון')) return 'יתרון ירושלמי';
  if (t.includes('פידבק')) return 'פידבק';
  if (t.includes('מרכז הבמה')) return 'מרכז הבמה';
  if (t.includes('חיות')) return 'חיות דקדושה';
  if (t === 'לבדיקה') return 'לבדיקה';
  return t;
};

const issues = {
  paidGtAmount: [],
  paidStatusZeroPaid: [],
  unpaidWithPaidAmt: [],
  amountZeroWithPaid: [],
  tagCategoryMismatch: [],
  unknownTag: [],
  emptyTag: [],
  cancelledWithDebt: [],
  needsTagNormalize: [],
  needsCategorySync: [],
};

const tagCounts = {};
const catCounts = {};
const proposedFixes = [];

for (const e of events) {
  const amount = num(e.amount);
  const paid = num(e.paidAmount);
  const tag = String(e.tag || '').trim();
  const cat = String(e.category || '').trim();
  const canon = canonicalTag(tag);
  const row = {
    id: e.id,
    title: String(e.title || '').slice(0, 50),
    date: e.date,
    amount,
    paid,
    status: e.status,
    paymentStatus: e.paymentStatus,
    tag,
    category: cat,
    eventType: e.eventType,
  };

  tagCounts[tag || '(ריק)'] = (tagCounts[tag || '(ריק)'] || 0) + 1;
  catCounts[cat || '(ריק)'] = (catCounts[cat || '(ריק)'] || 0) + 1;

  const fix = { id: e.id, updates: {} };

  if (paid > amount + 0.5) {
    issues.paidGtAmount.push(row);
    // Safe fix: if status is fully paid, amount should at least equal paid
    if (PAID.has(e.paymentStatus)) {
      fix.updates.amount = paid;
    } else {
      fix.updates.paidAmount = amount;
    }
  }

  if (PAID.has(e.paymentStatus) && paid <= 0 && amount > 0) {
    issues.paidStatusZeroPaid.push(row);
    fix.updates.paidAmount = amount;
  }

  if ((e.paymentStatus === 'טרם שולם' || !e.paymentStatus) && paid > 0) {
    issues.unpaidWithPaidAmt.push(row);
    if (paid >= amount && amount > 0) {
      fix.updates.paymentStatus = 'שולם';
      fix.updates.status = e.status === 'בוטל' ? e.status : 'שולם מלא';
    } else if (paid > 0 && paid < amount) {
      fix.updates.paymentStatus = 'שולם חלקית';
    }
  }

  if (amount <= 0 && paid > 0) {
    issues.amountZeroWithPaid.push(row);
    fix.updates.amount = paid;
  }

  if (tag && cat && tag !== cat) {
    issues.tagCategoryMismatch.push(row);
  }

  if (!tag) {
    issues.emptyTag.push(row);
    fix.updates.tag = 'קליכיף';
    fix.updates.category = 'קליכיף';
  } else if (canon && canon !== tag) {
    issues.needsTagNormalize.push(row);
    fix.updates.tag = canon;
  } else if (tag && !knownTags.has(tag) && !knownTags.has(canon)) {
    issues.unknownTag.push(row);
  }

  const finalTag = fix.updates.tag || tag;
  if (finalTag && cat !== finalTag) {
    issues.needsCategorySync.push(row);
    fix.updates.category = finalTag;
  }

  if (e.status === 'בוטל' && amount - paid > 1) {
    issues.cancelledWithDebt.push(row);
  }

  if (Object.keys(fix.updates).length) {
    proposedFixes.push({
      id: e.id,
      title: row.title,
      date: row.date,
      before: { amount, paid, tag, category: cat, paymentStatus: e.paymentStatus, status: e.status },
      updates: fix.updates,
    });
  }
}

const summary = {
  total: events.length,
  issueCounts: Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length])),
  proposedFixCount: proposedFixes.length,
  topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 25),
  topCats: Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 25),
};

const outDir = path.join(__dirname);
fs.writeFileSync(path.join(outDir, 'events-audit-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'events-proposed-fixes.json'), JSON.stringify(proposedFixes, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'events-issues-detail.json'), JSON.stringify(issues, null, 2), 'utf8');

console.log(JSON.stringify(summary, null, 2));
console.log('fixes sample:', JSON.stringify(proposedFixes.slice(0, 10), null, 2));
