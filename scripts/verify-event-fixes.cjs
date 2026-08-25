const fs = require('fs');
const path = require('path');

(async () => {
  const res = await fetch('https://myecrm2026.netlify.app/.netlify/functions/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getAll', table: 'events', orderBy: 'date', orderAsc: false }),
  });
  const json = await res.json();
  const events = json.data || [];
  fs.writeFileSync(path.join(__dirname, 'events_live.json'), JSON.stringify(events), 'utf8');

  const sampleIds = [
    'e_1784032184250',
    'e_1773842848690_332',
    'e_1773842848680_43',
    '61546abf-a15d-447f-a82a-83707175fadf',
    '404e7b75-f961-4d24-9754-c1451a3e67c3',
  ];
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  for (const id of sampleIds) {
    const e = byId[id];
    console.log(
      JSON.stringify({
        id,
        title: e?.title,
        amount: e?.amount,
        paid: e?.paidAmount,
        tag: e?.tag,
        category: e?.category,
        paymentStatus: e?.paymentStatus,
        status: e?.status,
      })
    );
  }

  const PAID = new Set([
    'שולם',
    'שולם - מזומן',
    "שולם העברה ל'",
    'שולם - אשראי',
    "שולם -צ'ק",
    "שולם - העברה ח'",
    "שולם - העברה מ'",
  ]);

  const catCounts = {};
  let paidZero = 0;
  let unpaidWithMoney = 0;
  let badStatusNames = 0;
  for (const e of events) {
    const c = e.category || '(empty)';
    catCounts[c] = (catCounts[c] || 0) + 1;
    if (PAID.has(e.paymentStatus) && Number(e.paidAmount || 0) <= 0 && Number(e.amount || 0) > 0) paidZero += 1;
    if ((e.paymentStatus === 'טרם שולם' || e.paymentStatus === 'לא שולם') && Number(e.paidAmount || 0) > 0) unpaidWithMoney += 1;
    if (e.status === 'אישור ראשוני' || e.paymentStatus === 'לא שולם') badStatusNames += 1;
  }

  console.log('topCats', Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 12));
  console.log({ total: events.length, paidZero, unpaidWithMoney, badStatusNames });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
