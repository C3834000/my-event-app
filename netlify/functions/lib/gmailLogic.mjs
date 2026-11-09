import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { getSupabase, logError } from './apiCommon.mjs';

/** עד כמה אחורה בסה"כ רוצים להגיע בסופו של דבר (היסטוריה) */
const MAX_BACKFILL_DAYS = 90;
/** כל ריצה חוזרת עוד שבוע אחורה — כדי לא למשוך הכל בבת אחת ולהסתכן בטיימאאוט של הפונקציה */
const BACKFILL_STEP_DAYS = 7;
const SETTINGS_ROW_ID = 'main';
const ATTACHMENTS_BUCKET = 'email-attachments';
/** לא מעלים צרופות גדולות מדי, כדי לא לנפח את האחסון בטעות (רוב ספקי המייל ממילא מגבילים ל-~25MB) */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function normalizeEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function addressList(value) {
  // mailparser: { value: [{ address, name }], text: '...' } | undefined
  return (value?.value || []).map((a) => String(a.address || '').trim()).filter(Boolean);
}

function firstAddress(value) {
  return addressList(value)[0] || '';
}

function snippetOf(text, html) {
  const plain = text || String(html || '').replace(/<[^>]+>/g, ' ');
  return plain.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** מזהה שיחה יציב: עדיף ה-References/In-Reply-To הראשון בשרשרת, אחרת ה-Message-ID של ההודעה עצמה. */
function resolveThreadId(parsed) {
  const refs = parsed.references
    ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
    : [];
  if (refs.length) return String(refs[0]).trim();
  if (parsed.inReplyTo) return String(parsed.inReplyTo).trim();
  return String(parsed.messageId || '').trim();
}

async function findSentMailbox(client) {
  try {
    const list = await client.list();
    const sent = list.find((m) => (m.specialUse || '') === '\\Sent');
    return sent?.path || '[Gmail]/Sent Mail';
  } catch {
    return '[Gmail]/Sent Mail';
  }
}

function matchParty(addresses, byEmail) {
  for (const addr of addresses) {
    const hit = byEmail.get(normalizeEmailKey(addr));
    if (hit) return hit;
  }
  return { customerId: null, leadId: null };
}

function safeFilename(name) {
  const base = String(name || 'attachment').replace(/[/\\?%*:|"<>]/g, '_').trim();
  return base.slice(0, 180) || 'attachment';
}

/** מעלה צרופות ל-Storage ומחזיר מטא-דאטה + URL ציבורי לכל אחת (קישורים בלבד נשמרים בטבלת emails). */
async function uploadAttachments(supabase, messageKey, attachments) {
  const out = [];
  for (let i = 0; i < (attachments || []).length; i++) {
    const att = attachments[i];
    if (!att?.content?.length || att.content.length > MAX_ATTACHMENT_BYTES) continue;
    const filename = safeFilename(att.filename);
    const path = `${messageKey}/${i}-${filename}`;
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, att.content, {
      contentType: att.contentType || 'application/octet-stream',
      upsert: true,
    });
    if (error) {
      logError('gmail-sync:attachment', error);
      continue;
    }
    const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
    out.push({ filename, contentType: att.contentType, size: att.content.length, url: data.publicUrl });
  }
  return out;
}

/** מושך ומפרסר הודעות לפי שאילתת IMAP חופשית (טווח UID להודעות חדשות, או טווח תאריכים ל-backfill). */
async function fetchMessages({ client, supabase, path, direction, byEmail, ownAddress, searchQuery }) {
  const lock = await client.getMailboxLock(path);
  try {
    const uids = await client.search(searchQuery, { uid: true });

    if (!uids || !uids.length) return { maxUid: 0, rows: [] };

    const rows = [];
    let maxUid = 0;

    for await (const message of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
      maxUid = Math.max(maxUid, message.uid);
      const parsed = await simpleParser(message.source);

      const fromAddr = firstAddress(parsed.from);
      const toAddrs = addressList(parsed.to);
      const otherParty = direction === 'inbound' ? [fromAddr] : toAddrs;
      const match = matchParty(otherParty, byEmail);

      const messageKey = (parsed.messageId || `${path}-${message.uid}`).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 120);
      const attachments = await uploadAttachments(supabase, messageKey, parsed.attachments);

      rows.push({
        id: crypto.randomUUID(),
        customer_id: match.customerId,
        lead_id: match.leadId,
        direction,
        from_email: fromAddr || ownAddress,
        from_name: parsed.from?.value?.[0]?.name || null,
        to_email: toAddrs.join(', ') || null,
        subject: parsed.subject || '(ללא נושא)',
        snippet: snippetOf(parsed.text, parsed.html),
        body_text: parsed.text || null,
        body_html: typeof parsed.html === 'string' ? parsed.html : null,
        message_id: parsed.messageId || null,
        thread_id: resolveThreadId(parsed),
        in_reply_to: parsed.inReplyTo || null,
        sent_at: (parsed.date || message.internalDate || new Date()).toISOString(),
        attachments: attachments.length ? attachments : null,
      });
    }

    return { maxUid, rows };
  } finally {
    lock.release();
  }
}

/**
 * מסנכרן מיילים מ-Gmail (IMAP, אותה סיסמת אפליקציה של SMTP_USER/SMTP_PASS) לטבלת emails,
 * ומשייך כל מייל ללקוח/ליד לפי כתובת המייל שלו.
 */
export async function runGmailSync(env) {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!user || !pass) {
    return { ok: false, statusCode: 503, error: 'Gmail לא מוגדר (צריך SMTP_USER + SMTP_PASS — אותם משתנים ששימוש לשליחת מיילים)' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, statusCode: 503, error: 'Database not configured' };
  }

  const [{ data: customers }, { data: leads }, { data: settingsRow }] = await Promise.all([
    supabase.from('customers').select('id, email'),
    supabase.from('leads').select('id, email'),
    supabase.from('settings').select('data').eq('id', SETTINGS_ROW_ID).maybeSingle(),
  ]);

  const byEmail = new Map();
  for (const c of customers || []) {
    if (c.email) byEmail.set(normalizeEmailKey(c.email), { customerId: c.id, leadId: null });
  }
  for (const l of leads || []) {
    const key = normalizeEmailKey(l.email);
    if (l.email && !byEmail.has(key)) byEmail.set(key, { customerId: null, leadId: l.id });
  }

  const settingsData = settingsRow?.data || {};
  const cursor = settingsData.gmailSync || {};
  const targetDate = new Date(Date.now() - MAX_BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  const client = new ImapFlow({
    host: env.IMAP_HOST || 'imap.gmail.com',
    port: Number(env.IMAP_PORT) || 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let totalRows = [];
  const nextCursor = { ...cursor };

  try {
    await client.connect();

    const sentPath = await findSentMailbox(client);
    const mailboxes = [
      { path: 'INBOX', direction: 'inbound', key: 'INBOX' },
      { path: sentPath, direction: 'outbound', key: 'SENT' },
    ];

    for (const mb of mailboxes) {
      const isFirstRun = !cursor[mb.key];
      const prev = cursor[mb.key] || {};
      const lastUid = Number(prev.lastUid) || 0;
      let maxUidSeen = lastUid;
      let boxRows = [];

      if (!isFirstRun && lastUid > 0) {
        // המשך רגיל: רק מה שהגיע מאז הפעם הקודמת
        const { maxUid, rows } = await fetchMessages({
          client, supabase, path: mb.path, direction: mb.direction, byEmail, ownAddress: user,
          searchQuery: { uid: `${lastUid + 1}:*` },
        });
        maxUidSeen = Math.max(maxUidSeen, maxUid);
        boxRows = boxRows.concat(rows);
      }

      if (isFirstRun) {
        // פעם ראשונה למייל-בוקס הזה: שואבים רק את השבוע האחרון, וקובעים ממנו את נקודת ההמשך קדימה
        // ואת נקודת ההתחלה של ה-backfill אחורה (שאר ה-90 יום נמשכים בהדרגה בריצות הבאות).
        // (isFirstRun נקבע לפי קיום המפתח ב-cursor, לא לפי lastUid — אחרת מייל-בוקס בלי הודעות
        // בשבוע האחרון היה נתקע לנצח על אותו שבוע ולא מתקדם אל ההיסטוריה הישנה יותר.)
        const seedSince = new Date(Date.now() - BACKFILL_STEP_DAYS * 24 * 60 * 60 * 1000);
        const { maxUid, rows } = await fetchMessages({
          client, supabase, path: mb.path, direction: mb.direction, byEmail, ownAddress: user,
          searchQuery: { since: seedSince },
        });
        maxUidSeen = Math.max(maxUidSeen, maxUid);
        boxRows = boxRows.concat(rows);
        nextCursor[mb.key] = { lastUid: maxUidSeen, backfillBefore: seedSince.toISOString() };
      } else {
        // backfillBefore חסר (מייל-בוקס שכבר סונכרן לפני שהוספנו backfill הדרגתי) = נחשב כאילו כבר הושלם.
        const backfillBefore = prev.backfillBefore ? new Date(prev.backfillBefore) : targetDate;
        if (backfillBefore > targetDate) {
          const nextBefore = new Date(Math.max(targetDate.getTime(), backfillBefore.getTime() - BACKFILL_STEP_DAYS * 24 * 60 * 60 * 1000));
          const { rows } = await fetchMessages({
            client, supabase, path: mb.path, direction: mb.direction, byEmail, ownAddress: user,
            searchQuery: { since: nextBefore, before: backfillBefore },
          });
          boxRows = boxRows.concat(rows);
          nextCursor[mb.key] = { lastUid: maxUidSeen, backfillBefore: nextBefore.toISOString() };
        } else {
          nextCursor[mb.key] = { lastUid: maxUidSeen, backfillBefore: backfillBefore.toISOString() };
        }
      }

      totalRows = totalRows.concat(boxRows);
    }
  } catch (err) {
    logError('gmail-sync', err);
    return { ok: false, statusCode: 500, error: err.message || String(err) };
  } finally {
    try {
      await client.logout();
    } catch {
      // כבר מנותק
    }
  }

  if (totalRows.length) {
    const { error } = await supabase.from('emails').upsert(totalRows, { onConflict: 'message_id' });
    if (error) {
      logError('gmail-sync:upsert', error);
      return { ok: false, statusCode: 500, error: error.message };
    }
  }

  await supabase
    .from('settings')
    .update({ data: { ...settingsData, gmailSync: nextCursor } })
    .eq('id', SETTINGS_ROW_ID);

  const matched = totalRows.filter((r) => r.customer_id || r.lead_id).length;
  const backfillComplete = Object.values(nextCursor).every(
    (v) => !v?.backfillBefore || new Date(v.backfillBefore) <= targetDate
  );
  return { ok: true, statusCode: 200, synced: totalRows.length, matched, backfillComplete };
}

/** שולח תגובה דרך Gmail SMTP (אותו חשבון ששולח כבר היום), עם כותרות threading, ושומר שורה בטבלת emails. */
export async function sendGmailReply(body, env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, FROM_NAME } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { ok: false, statusCode: 503, error: 'Email not configured on server' };
  }

  const { to, subject, text, html, inReplyToMessageId, threadId, customerId, leadId, attachments: rawAttachments } = body || {};
  if (!to || !subject) {
    return { ok: false, statusCode: 400, error: 'Missing to or subject' };
  }

  // מגבלה שמרנית (לא זהה ל-15MB של הסנכרון): גוף הבקשה עובר כ-JSON/base64 דרך פונקציית Netlify,
  // שיש לה תקרת גודל נמוכה בהרבה מ-15MB — לכן כאן שומרים על קובץ קטן ועל סה"כ קטן.
  const MAX_SEND_ATTACHMENT_BYTES = 3 * 1024 * 1024;
  const MAX_SEND_ATTACHMENTS_TOTAL_BYTES = 4 * 1024 * 1024;

  let attachmentBuffers = [];
  if (Array.isArray(rawAttachments) && rawAttachments.length) {
    let total = 0;
    for (const a of rawAttachments) {
      let buf;
      try {
        buf = Buffer.from(String(a.contentBase64 || ''), 'base64');
      } catch {
        return { ok: false, statusCode: 400, error: `קובץ לא תקין: ${a.filename || ''}` };
      }
      if (buf.length > MAX_SEND_ATTACHMENT_BYTES) {
        return { ok: false, statusCode: 400, error: `הקובץ "${a.filename}" גדול מדי (מקסימום 3MB לקובץ)` };
      }
      total += buf.length;
      if (total > MAX_SEND_ATTACHMENTS_TOTAL_BYTES) {
        return { ok: false, statusCode: 400, error: 'סך הקבצים המצורפים גדול מדי (מקסימום 4MB בסך הכל)' };
      }
      attachmentBuffers.push({ filename: a.filename || 'attachment', contentType: a.contentType, content: buf });
    }
  }

  const port = Number(SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const from = `"${FROM_NAME || 'קליכיף'}" <${FROM_EMAIL || SMTP_USER}>`;

  let info;
  try {
    info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || (html ? String(html).replace(/<[^>]+>/g, '') : ''),
      html: html || undefined,
      ...(inReplyToMessageId ? { inReplyTo: inReplyToMessageId, references: inReplyToMessageId } : {}),
      ...(attachmentBuffers.length
        ? { attachments: attachmentBuffers.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) }
        : {}),
    });
  } catch (err) {
    const message = err.message || String(err);
    const authFailed = /Invalid login|535|Authentication failed|EAUTH|bad credentials/i.test(message);
    return {
      ok: false,
      statusCode: 500,
      error: message,
      hint: authFailed
        ? 'אימות SMTP נכשל. ב-Gmail צריך "סיסמת אפליקציה" ב-SMTP_PASS (לא סיסמת הגוגל הרגילה).'
        : undefined,
    };
  }

  const supabase = getSupabase();
  const messageKey = (info.messageId || crypto.randomUUID()).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 120);
  const uploadedAttachments = supabase && attachmentBuffers.length
    ? await uploadAttachments(supabase, messageKey, attachmentBuffers)
    : [];

  const row = {
    id: crypto.randomUUID(),
    customer_id: customerId || null,
    lead_id: leadId || null,
    direction: 'outbound',
    from_email: FROM_EMAIL || SMTP_USER,
    from_name: FROM_NAME || 'קליכיף',
    to_email: Array.isArray(to) ? to.join(', ') : to,
    subject,
    snippet: snippetOf(text, html),
    body_text: text || null,
    body_html: html || null,
    message_id: info.messageId || null,
    thread_id: threadId || info.messageId || null,
    in_reply_to: inReplyToMessageId || null,
    sent_at: new Date().toISOString(),
    attachments: uploadedAttachments.length ? uploadedAttachments : null,
  };

  if (supabase) {
    const { error } = await supabase.from('emails').insert(row);
    if (error) logError('gmail-reply:insert', error);
  }

  return { ok: true, statusCode: 200, email: row };
}
