import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { getSupabase, logError } from './apiCommon.mjs';

/** עד כמה אחורה בסה"כ רוצים להגיע בסופו של דבר (היסטוריה) */
const MAX_BACKFILL_DAYS = 90;
/** כל ריצה חוזרת עוד שבוע אחורה — כדי לא למשוך הכל בבת אחת ולהסתכן בטיימאאוט של הפונקציה */
const BACKFILL_STEP_DAYS = 7;
/** מקסימום הודעות לריצה אחת — כדי שהפונקציה תסיים בזמן וההתקדמות תישמר */
const BATCH_LIMIT = 25;
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

/** פרסומות, דיוורים ומיילים אוטומטיים — לא נשמרים גם אם הכתובת שייכת ללקוח. */
function isBulkOrAutomated(parsed, fromAddr) {
  const headerText = (name) => {
    const v = parsed.headers?.get?.(name);
    if (v == null) return '';
    return String(typeof v === 'object' && 'text' in v ? v.text : v).toLowerCase();
  };
  if (parsed.headers?.has?.('list-unsubscribe') || parsed.headers?.has?.('list-id')) return true;
  if (['bulk', 'list', 'junk'].includes(headerText('precedence'))) return true;
  const auto = headerText('auto-submitted');
  if (auto && auto !== 'no') return true;
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|newsletter|marketing|news|info|updates?|notifications?)@/i.test(fromAddr)) return true;
  return false;
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

/** מושך עד `limit` הודעות (הישנות ביותר קודם) שה-UID שלהן גדול מ-minUid. מחזיר גם כמה נשארו מעבר לזה. */
async function fetchBatch({ client, supabase, path, direction, byEmail, ownAddress, searchQuery, minUid, limit }) {
  const lock = await client.getMailboxLock(path);
  try {
    // "n:*" ב-IMAP מחזיר תמיד לפחות את ההודעה האחרונה, גם אם n גדול ממנה — לכן מסננים בעצמנו.
    const found = ((await client.search(searchQuery, { uid: true })) || [])
      .filter((u) => u > minUid)
      .sort((a, b) => a - b);

    if (!found.length) return { maxUid: minUid, rows: [], remaining: 0 };

    const uids = found.slice(0, limit);
    const remaining = found.length - uids.length;
    const rows = [];
    let maxUid = minUid;

    for await (const message of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
      maxUid = Math.max(maxUid, message.uid);
      const parsed = await simpleParser(message.source);

      const fromAddr = firstAddress(parsed.from);
      const toAddrs = addressList(parsed.to);
      const otherParty = direction === 'inbound' ? [fromAddr] : toAddrs;
      const match = matchParty(otherParty, byEmail);
      // שומרים רק מיילים של לקוחות/לידים שקיימים במערכת — השאר מדלגים (לא נשמרים ולא מעלים צרופות)
      if (!match.customerId && !match.leadId) continue;
      if (isBulkOrAutomated(parsed, fromAddr)) continue;

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

    return { maxUid, rows, remaining };
  } finally {
    lock.release();
  }
}

async function currentTopUid(client, path) {
  const lock = await client.getMailboxLock(path);
  try {
    return Math.max(0, (client.mailbox?.uidNext || 1) - 1);
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

    let budget = BATCH_LIMIT;
    for (const mb of mailboxes) {
      let state = cursor[mb.key];
      if (!state) {
        // מייל-בוקס חדש: מתחילים לעקוב מה-UID העליון הנוכחי (מייל ישן לא ייכנס דרך המסלול הזה),
        // וההיסטוריה נמשכת אחורה מהיום והלאה.
        state = {
          lastUid: await currentTopUid(client, mb.path),
          backfillBefore: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          backfillResumeUid: 0,
        };
      }

      // 1) מייל חדש מאז הריצה הקודמת
      if (budget > 0) {
        const r = await fetchBatch({
          client, supabase, path: mb.path, direction: mb.direction, byEmail, ownAddress: user,
          searchQuery: { uid: `${state.lastUid + 1}:*` }, minUid: state.lastUid, limit: budget,
        });
        totalRows = totalRows.concat(r.rows);
        budget -= r.rows.length;
        state.lastUid = Math.max(state.lastUid, r.maxUid);
      }

      // 2) היסטוריה: חלון של שבוע אחורה, בתוך אותו תקציב של הודעות
      const before = new Date(state.backfillBefore);
      if (budget > 0 && before > targetDate) {
        const since = new Date(Math.max(targetDate.getTime(), before.getTime() - BACKFILL_STEP_DAYS * 24 * 60 * 60 * 1000));
        const resume = Number(state.backfillResumeUid) || 0;
        const r = await fetchBatch({
          client, supabase, path: mb.path, direction: mb.direction, byEmail, ownAddress: user,
          searchQuery: { since, before, uid: `${resume + 1}:*` }, minUid: resume, limit: budget,
        });
        totalRows = totalRows.concat(r.rows);
        budget -= r.rows.length;
        if (r.remaining > 0) {
          // החלון עדיין לא נגמר — ממשיכים ממנו בריצה הבאה
          state.backfillResumeUid = r.maxUid;
        } else {
          state.backfillBefore = since.toISOString();
          state.backfillResumeUid = 0;
        }
      }

      nextCursor[mb.key] = state;
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
