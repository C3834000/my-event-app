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

const num = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
};

const canonicalTag = (tag) => {
  const t = String(tag || '').replace(/["״]/g, '״').trim();
  if (!t) return 'קליכיף';
  if (t.includes('גפן') && t.includes('תשפ') && t.includes('ה')) return 'גפן תשפ״ה';
  if (t.includes('גפן') && t.includes('תשפ') && t.includes('ד')) return 'גפן תשפ״ד';
  if (t.includes('זה') && t.includes('ב') && (t.includes('י-ם') || t.includes('ירושל'))) return 'זה״ב - עיריית י-ם';
  if (t.includes('קליכיף')) return 'קליכיף';
  if (t.includes('יתרון')) return 'יתרון ירושלמי';
  if (t.includes('פידבק')) return 'פידבק';
  if (t.includes('מרכז הבמה')) return 'מרכז הבמה';
  if (t.includes('חיות')) return 'חיות דקדושה';
  if (t === 'לבדיקה') return 'לבדיקה';
  return t;
};

const proposedFixes = [];

for (const e of events) {
  const amount = num(e.amount);
  const paid = num(e.paidAmount);
  const tag = String(e.tag || '').trim();
  const cat = String(e.category || '').trim();
  const updates = {};

  const nextTag = canonicalTag(tag);
  if (nextTag !== tag) updates.tag = nextTag;

  const finalTag = updates.tag || tag || 'קליכיף';
  if (cat !== finalTag) updates.category = finalTag;

  let paymentStatus = e.paymentStatus || '';
  let status = e.status || '';

  if (paymentStatus === 'לא שולם') {
    updates.paymentStatus = 'טרם שולם';
    paymentStatus = 'טרם שולם';
  }

  if (status === 'אישור ראשוני') {
    updates.status = 'שוריין';
    status = 'שוריין';
  }

  let nextPaid = paid;
  let nextAmount = amount;

  if (PAID.has(paymentStatus) && nextPaid <= 0 && nextAmount > 0) {
    updates.paidAmount = nextAmount;
    nextPaid = nextAmount;
  }

  if (nextPaid > nextAmount + 0.5) {
    if (PAID.has(paymentStatus)) {
      updates.amount = nextPaid;
      nextAmount = nextPaid;
    } else {
      updates.paidAmount = nextAmount;
      nextPaid = nextAmount;
    }
  }

  if ((paymentStatus === 'טרם שולם' || !paymentStatus) && nextPaid > 0) {
    if (nextPaid + 0.5 >= nextAmount && nextAmount > 0) {
      updates.paymentStatus = 'שולם';
      paymentStatus = 'שולם';
      if (status !== 'בוטל') {
        updates.status = 'שולם מלא';
        status = 'שולם מלא';
      }
    } else if (nextPaid > 0 && nextPaid < nextAmount) {
      updates.paymentStatus = 'שולם חלקית';
      paymentStatus = 'שולם חלקית';
    }
  }

  if (PAID.has(paymentStatus) && nextPaid + 0.5 >= nextAmount && nextAmount > 0 && status !== 'בוטל' && status !== 'שולם מלא') {
    updates.status = 'שולם מלא';
  }

  if (Object.keys(updates).length) {
    proposedFixes.push({
      id: e.id,
      title: String(e.title || '').slice(0, 60),
      date: e.date,
      before: {
        amount,
        paid,
        tag,
        category: cat,
        paymentStatus: e.paymentStatus,
        status: e.status,
      },
      updates,
    });
  }
}

fs.writeFileSync(path.join(__dirname, 'events-proposed-fixes.json'), JSON.stringify(proposedFixes, null, 2), 'utf8');

const kinds = {
  category: 0,
  tag: 0,
  paidAmount: 0,
  amount: 0,
  paymentStatus: 0,
  status: 0,
};
for (const f of proposedFixes) {
  for (const k of Object.keys(f.updates)) kinds[k] = (kinds[k] || 0) + 1;
}

console.log(JSON.stringify({ totalEvents: events.length, fixCount: proposedFixes.length, kinds }, null, 2));
