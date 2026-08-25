import { createClient } from '@supabase/supabase-js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIcsDateTime(dateStr, timeStr) {
  const date = String(dateStr || '').slice(0, 10).replace(/-/g, '');
  const raw = String(timeStr || '10:00').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  const hh = pad(m ? Number(m[1]) : 10);
  const mm = pad(m ? Number(m[2]) : 0);
  return `${date}T${hh}${mm}00`;
}

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line) {
  if (line.length <= 75) return line;
  let out = '';
  let rest = line;
  while (rest.length > 75) {
    out += `${rest.slice(0, 75)}\r\n `;
    rest = rest.slice(75);
  }
  return out + rest;
}

function buildIcs(events) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clickef CRM//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:קליכיף - אירועים',
    'X-WR-TIMEZONE:Asia/Jerusalem',
  ];

  for (const ev of events) {
    if (!ev.date) continue;
    if (ev.status === 'בוטל') continue;
    const start = toIcsDateTime(ev.date, ev.start_time || ev.startTime || '10:00');
    const end = toIcsDateTime(ev.date, ev.end_time || ev.endTime || '11:30');
    const title = ev.title || 'אירוע קליכיף';
    const location = ev.location || '';
    const descParts = [
      ev.event_type || ev.eventType ? `סוג: ${ev.event_type || ev.eventType}` : '',
      ev.tag ? `תג: ${ev.tag}` : '',
      ev.phone ? `טלפון: ${ev.phone}` : '',
      ev.email ? `אימייל: ${ev.email}` : '',
      ev.amount != null ? `סכום: ₪${ev.amount}` : '',
      ev.payment_status || ev.paymentStatus ? `תשלום: ${ev.payment_status || ev.paymentStatus}` : '',
      ev.notes ? `הערות: ${ev.notes}` : '',
      `מזהה: ${ev.id}`,
    ].filter(Boolean);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcs(ev.id)}@myecrm2026.netlify.app`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=Asia/Jerusalem:${start}`);
    lines.push(`DTEND;TZID=Asia/Jerusalem:${end}`);
    lines.push(`SUMMARY:${escapeIcs(title)}`);
    if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
    lines.push(`DESCRIPTION:${escapeIcs(descParts.join('\\n'))}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'no-cache, max-age=300',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 503, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('events')
      .select('id,title,date,start_time,end_time,location,notes,phone,email,tag,status,payment_status,event_type,amount')
      .order('date', { ascending: true })
      .limit(2000);

    if (error) {
      return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
    }

    const ics = buildIcs(data || []);
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Disposition': 'inline; filename="clickef-events.ics"',
      },
      body: ics,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
