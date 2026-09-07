// הרצת מיגרציה 002 (כיוון 'tracking') על ייצור דרך Management API.
import fs from 'node:fs';

const token = (fs.readFileSync('.env.documents-prod', 'utf8').match(/SUPABASE_ACCESS_TOKEN=(\S+)/) || [])[1];
const REF = 'nzlrnkzbgrnawnggnsul';
const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const sql = fs.readFileSync('db/migrations/002_direction_tracking.sql', 'utf8');
const mig = await q(sql);
console.log('migration status:', mig.status);
const chk = await q(`select pg_get_constraintdef(oid) as def from pg_constraint where conname='documents_direction_check'`);
console.log('constraint:', JSON.stringify(chk.json));
