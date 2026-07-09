import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

/**
 * תזכורת אוטומטית ללקוח יומיים לפני האירוע.
 * נקרא אוטומטית ע"י Netlify Scheduled Functions (ראה netlify.toml) פעם ביום.
 *
 * זרימה:
 *   1. מחשב את התאריך של "היום + יומיים" לפי שעון ישראל.
 *   2. מושך מ-Supabase את כל האירועים בתאריך הזה.
 *   3. לכל אירוע עם כתובת מייל — שולח עותק של כרטיס האירוע + נוסח אישור פרטים.
 *   4. מונע כפילויות דרך טבלת event_reminders (אם קיימת). אם הטבלה לא קיימת,
 *      המנגנון עדיין בטוח כי הפונקציה רצה פעם ביום על חלון תאריך יחיד.
 *
 * דרישת חד-פעמית מומלצת (Supabase SQL) למניעת כפל ודאית:
 *   create table if not exists event_reminders (
 *     event_id text primary key,
 *     sent_at timestamptz default now()
 *   );
 */

const sanitizeAddress = (value) =>
  String(value || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF\u00A0]/g, '')
    .replace(/\s+/g, '')
    .trim();

function israelDatePlusDays(days) {
  const israelNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  israelNow.setDate(israelNow.getDate() + days);
  const y = israelNow.getFullYear();
  const m = String(israelNow.getMonth() + 1).padStart(2, '0');
  const d = String(israelNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildReminderHtml(event, settings) {
  const companyName = settings.company_name || 'קליכיף';
  const contactPhone = settings.contact_phone || '052-9934000';
  const niceDate = (() => {
    try {
      return new Date(`${String(event.date).slice(0, 10)}T12:00:00`).toLocaleDateString('he-IL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch {
      return String(event.date || '').slice(0, 10);
    }
  })();

  const row = (icon, label, value) => value
    ? `<tr>
         <td style="padding:10px 14px; color:#64748b; font-weight:700; border-bottom:1px solid #eef2f7; white-space:nowrap;">${icon} ${label}</td>
         <td style="padding:10px 14px; color:#1e293b; font-weight:700; border-bottom:1px solid #eef2f7;">${value}</td>
       </tr>`
    : '';

  const timeText = event.start_time
    ? `${event.start_time}${event.end_time ? ' – ' + event.end_time : ''}`
    : '';

  return `
  <div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; padding:24px; color:#1e293b;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 6px 24px rgba(15,23,42,.08);">

      <div style="background:linear-gradient(135deg,#7c3aed,#ec4899); padding:28px 24px; text-align:center; color:#fff;">
        <div style="font-size:30px; margin-bottom:6px;">📅</div>
        <h1 style="margin:0; font-size:22px; font-weight:900;">האירוע שלכם מתקרב!</h1>
        <p style="margin:8px 0 0; font-size:14px; opacity:.95;">עוד יומיים — בואו נוודא שהכל מוכן ומדויק</p>
      </div>

      <div style="padding:24px;">
        <p style="font-size:15px; line-height:1.7; margin:0 0 18px;">
          שלום רב,<br/>
          היות ואנו מתקרבים לאירוע שלכם, ברצוננו <strong>לוודא שאין שינוי בפרטי האירוע</strong> שהוזנו במערכת,
          ולבדוק האם <strong>החידון שלכם כבר מוכן</strong> והאם הכל ברור.
          נשמח לענות על כל שאלה 🙂
        </p>

        <div style="background:#faf5ff; border:1px solid #efe1ff; border-radius:14px; padding:6px 14px 14px;">
          <h2 style="font-size:14px; color:#7c3aed; font-weight:900; margin:14px 4px 10px;">📋 פרטי האירוע במערכת</h2>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            ${row('🎯', 'אירוע:', event.title)}
            ${row('📆', 'תאריך:', niceDate)}
            ${row('🗓️', 'תאריך עברי:', event.hebrew_date)}
            ${row('🕒', 'שעה:', timeText)}
            ${row('📍', 'מיקום:', event.location)}
            ${row('🧩', 'סוג אירוע:', event.event_type)}
            ${row('🖱️', 'קליקרים:', event.clickers_needed ? `${event.clickers_needed}` : '')}
            ${row('📞', 'טלפון לתיאום:', event.phone)}
          </table>
        </div>

        <div style="background:#ecfdf5; border:1px solid #d1fae5; border-radius:14px; padding:16px; margin-top:16px;">
          <p style="margin:0; font-size:14px; line-height:1.7; color:#065f46;">
            ✅ אם כל הפרטים נכונים — מצוין, אנחנו מוכנים!<br/>
            ✏️ אם יש שינוי בפרטים, או שאלה כלשהי — פשוט השיבו למייל הזה${contactPhone ? ` או חייגו ל-${contactPhone}` : ''}.
          </p>
        </div>

        <div style="text-align:center; margin-top:22px;">
          <a href="https://quikhiv-trivia.netlify.app/"
             style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#ec4899); color:#fff; text-decoration:none; font-weight:900; font-size:15px; padding:14px 30px; border-radius:12px;">
            🧩 לאתר הכנת החידון
          </a>
        </div>
      </div>

      <div style="background:#f8fafc; padding:18px 24px; text-align:center; color:#94a3b8; font-size:12px;">
        נשלח אוטומטית ממערכת ${companyName} · מצפים לאירוע מוצלח! 🎉
      </div>
    </div>
  </div>`;
}

export default async () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[event-reminders] missing Supabase env');
    return new Response(JSON.stringify({ ok: false, error: 'supabase env' }), { status: 503 });
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('[event-reminders] missing SMTP env');
    return new Response(JSON.stringify({ ok: false, error: 'smtp env' }), { status: 503 });
  }

  const supabase = createClient(url, key);
  const target = israelDatePlusDays(2);
  const targetNext = israelDatePlusDays(3);

  // אירועים בתאריך היעד (תומך גם בעמודת date מסוג date וגם timestamp)
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .gte('date', target)
    .lt('date', targetNext);

  if (error) {
    console.error('[event-reminders] query error', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const candidates = (events || []).filter((e) => sanitizeAddress(e.email));
  if (!candidates.length) {
    console.log(`[event-reminders] no events with email on ${target}`);
    return new Response(JSON.stringify({ ok: true, target, sent: 0 }), { status: 200 });
  }

  // מניעת כפילויות (אם טבלת event_reminders קיימת)
  let alreadySent = new Set();
  let dedupEnabled = true;
  try {
    const ids = candidates.map((e) => e.id);
    const { data: sentRows, error: sentErr } = await supabase
      .from('event_reminders')
      .select('event_id')
      .in('event_id', ids);
    if (sentErr) throw sentErr;
    alreadySent = new Set((sentRows || []).map((r) => r.event_id));
  } catch (e) {
    dedupEnabled = false;
    console.warn('[event-reminders] dedup table unavailable, proceeding without it:', e?.message || e);
  }

  // הגדרות (שם חברה, טלפון)
  let settings = {};
  try {
    const { data: srows } = await supabase.from('settings').select('*').limit(1);
    settings = srows?.[0] || {};
  } catch {
    settings = {};
  }

  const port = Number(SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  let sent = 0;
  const failures = [];
  for (const ev of candidates) {
    if (alreadySent.has(ev.id)) continue;
    const toEmail = sanitizeAddress(ev.email);
    try {
      await transporter.sendMail({
        from: `"${FROM_NAME || settings.company_name || 'קליכיף'}" <${FROM_EMAIL || SMTP_USER}>`,
        to: toEmail,
        subject: `תזכורת: האירוע שלכם בעוד יומיים — ${ev.title || ''}`.trim(),
        html: buildReminderHtml(ev, settings),
      });
      sent += 1;
      if (dedupEnabled) {
        await supabase.from('event_reminders').upsert([{ event_id: ev.id, sent_at: new Date().toISOString() }]);
      }
    } catch (err) {
      failures.push({ id: ev.id, error: err?.message || String(err) });
      console.error(`[event-reminders] failed for ${ev.id}:`, err?.message || err);
    }
  }

  console.log(`[event-reminders] target=${target} candidates=${candidates.length} sent=${sent} failures=${failures.length}`);
  return new Response(
    JSON.stringify({ ok: true, target, candidates: candidates.length, sent, failures }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
