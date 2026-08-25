const fs = require('fs');
const path = require('path');

const API = 'https://myecrm2026.netlify.app/.netlify/functions/db';
const fixes = JSON.parse(fs.readFileSync(path.join(__dirname, 'events-proposed-fixes.json'), 'utf8'));
const concurrency = Number(process.env.FIX_CONCURRENCY || 6);
const dryRun = process.argv.includes('--dry-run');

async function updateEvent(fix) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update',
      table: 'events',
      id: fix.id,
      data: fix.updates,
    }),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`bad response for ${fix.id}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status} for ${fix.id}`);
  return json;
}

async function runPool(items, limit, worker) {
  let idx = 0;
  let ok = 0;
  let fail = 0;
  const errors = [];

  async function next() {
    while (idx < items.length) {
      const current = items[idx++];
      try {
        if (!dryRun) await worker(current);
        ok += 1;
        if (ok % 25 === 0 || ok === items.length) {
          console.log(`progress ${ok}/${items.length} (fail=${fail})`);
        }
      } catch (err) {
        fail += 1;
        errors.push({ id: current.id, error: String(err.message || err) });
        console.error('fail', current.id, err.message || err);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return { ok, fail, errors };
}

(async () => {
  console.log(dryRun ? 'DRY RUN' : 'APPLYING', 'fixes=', fixes.length);
  const result = await runPool(fixes, concurrency, updateEvent);
  fs.writeFileSync(path.join(__dirname, 'events-fix-result.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
