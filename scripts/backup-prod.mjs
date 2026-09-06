// גיבוי קריאה-בלבד של נתוני הייצור לקבצים מקומיים (test-env/backup — מחוץ ל-git).
// עובר דרך פונקציית ה-DB של האתר החי — אותו מסלול שהאפליקציה משתמשת בו.
// הרצה: node scripts/backup-prod.mjs
import fs from 'node:fs';

const SITE = 'https://myecrm2026.netlify.app';
const TABLES = ['customers', 'events', 'leads', 'tasks', 'settings'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `test-env/backup/${stamp}`;
fs.mkdirSync(dir, { recursive: true });

let total = 0;
for (const t of TABLES) {
  try {
    const res = await fetch(`${SITE}/.netlify/functions/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: t, action: 'getAll' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.data || data.rows || []);
    fs.writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows, null, 1), 'utf8');
    console.log(`✓ ${t}: ${rows.length} שורות`);
    total += rows.length;
  } catch (e) {
    console.log(`- ${t}: ${e.message}`);
  }
}
console.log(`הגיבוי נשמר: ${dir} (סה"כ ${total} שורות)`);
