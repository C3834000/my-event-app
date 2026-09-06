// הרצת מיגרציית מסמכים על Supabase ייצור דרך Management API + שליפת service role key.
// הטוקן נקרא מ-.env.documents-prod (קובץ מוגן, לא ב-Git). לא מדפיס סודות ללוג.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const envFile = path.join(root, '.env.documents-prod');
const envText = fs.readFileSync(envFile, 'utf8');
const token = (envText.match(/SUPABASE_ACCESS_TOKEN=(\S+)/) || [])[1];
if (!token) { console.error('אין טוקן בקובץ'); process.exit(1); }

const REF = 'nzlrnkzbgrnawnggnsul';
const API = 'https://api.supabase.com';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function api(method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

// 1) אימות טוקן ופרויקט
const projects = await api('GET', '/v1/projects');
if (projects.status !== 200) {
  console.error('שגיאת טוקן/הרשאה:', projects.status, typeof projects.json === 'string' ? projects.json.slice(0, 200) : JSON.stringify(projects.json).slice(0, 200));
  process.exit(1);
}
const proj = (projects.json || []).find(p => p.id === REF);
console.log('פרויקט נמצא:', proj ? `${proj.name} (${proj.region}, ${proj.status})` : 'לא נמצא!');
if (!proj) process.exit(1);

// 2) הרצת המיגרציה
const sql = fs.readFileSync(path.join(root, 'db', 'migrations', '001_documents.sql'), 'utf8');
const mig = await api('POST', `/v1/projects/${REF}/database/query`, { query: sql });
if (mig.status >= 300) {
  console.error('שגיאת מיגרציה:', mig.status, JSON.stringify(mig.json).slice(0, 500));
  process.exit(1);
}
console.log('המיגרציה הורצה בהצלחה (status', mig.status + ')');

// 3) אימות שהטבלאות קיימות
const check = await api('POST', `/v1/projects/${REF}/database/query`, {
  query: `select table_name from information_schema.tables where table_schema='public' and table_name in ('documents','document_sources') order by table_name;`
});
console.log('טבלאות:', JSON.stringify(check.json));

// 4) אימות דלי אחסון
const bucket = await api('POST', `/v1/projects/${REF}/database/query`, {
  query: `select id, public from storage.buckets where id='documents';`
});
console.log('דלי אחסון:', JSON.stringify(bucket.json));

// 5) שליפת service role key ושמירה לקובץ המוגן (לא מודפס)
const keys = await api('GET', `/v1/projects/${REF}/api-keys?reveal=true`);
if (keys.status !== 200) {
  console.error('שגיאה בשליפת מפתחות:', keys.status, JSON.stringify(keys.json).slice(0, 300));
  process.exit(1);
}
const svc = (keys.json || []).find(k => k.name === 'service_role');
if (!svc || !svc.api_key) { console.error('service_role לא נמצא'); process.exit(1); }
fs.appendFileSync(envFile, `SUPABASE_SERVICE_ROLE_KEY=${svc.api_key}\n`);
console.log('service role key נשמר לקובץ המוגן (אורך:', svc.api_key.length, 'תווים)');
