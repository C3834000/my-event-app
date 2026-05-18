-- =============================================================================
-- מחיקת אירועי "גלים תיירות" — נשארים רק 6 האירועים האחרונים שנוספו למערכת
-- הרץ ב-Supabase → SQL Editor (שלב אחרי שלב!)
--
-- סדר שמירה: created_at (הכי חדש קודם) → תאריך האירוע → id
-- אם אין created_at בשורה — מתייחסים לתאריך האירוע ול-id.
-- אם יש 6 או פחות התאמות — לא יימחק כלום.
-- =============================================================================

-- =============================================================================
-- שלב 0 (חובה!): גיבוי מלא של כל אירועי גלים תיירות לפני המחיקה
-- יוצר טבלת גיבוי בשם events_galim_backup_YYYYMMDD עם כל השורות שעומדות להימחק.
-- אם משהו ישתבש — אפשר לשחזר מהטבלה הזו.
-- =============================================================================
CREATE TABLE IF NOT EXISTS events_galim_backup_20260518 AS
SELECT e.*
FROM events e
LEFT JOIN customers c ON c.id = e.customer_id
WHERE
  e.title ILIKE '%גלים תיירות%'
  OR c.name ILIKE '%גלים תיירות%';

-- בדיקה: כמה שורות נשמרו בגיבוי?
SELECT COUNT(*) AS total_backed_up FROM events_galim_backup_20260518;


-- =============================================================================
-- שלב 1: תצוגה מקדימה — אלו 6 יישמרו (שורות ראשונות), השאר יימחקו
-- בדוק שהשורות עם will_keep_rank 1–6 הן אלו שאתה רוצה לשמור.
-- =============================================================================
SELECT
  e.id,
  e.title,
  e.date::text AS event_date,
  e.created_at,
  c.name AS customer_name,
  ROW_NUMBER() OVER (
    ORDER BY e.created_at DESC NULLS LAST, e.date DESC NULLS LAST, e.id DESC
  ) AS will_keep_rank
FROM events e
LEFT JOIN customers c ON c.id = e.customer_id
WHERE
  e.title ILIKE '%גלים תיירות%'
  OR c.name ILIKE '%גלים תיירות%'
ORDER BY e.created_at DESC NULLS LAST, e.date DESC NULLS LAST, e.id DESC;


-- =============================================================================
-- שלב 2: מחיקה — רק אחרי שווידאת בשלב 1!
-- מומלץ להריץ בתוך טרנזקציה כדי שאפשר יהיה לבטל אם משהו לא נראה טוב.
-- =============================================================================
BEGIN;

WITH ranked AS (
  SELECT
    e.id,
    ROW_NUMBER() OVER (
      ORDER BY e.created_at DESC NULLS LAST, e.date DESC NULLS LAST, e.id DESC
    ) AS rn
  FROM events e
  LEFT JOIN customers c ON c.id = e.customer_id
  WHERE
    e.title ILIKE '%גלים תיירות%'
    OR c.name ILIKE '%גלים תיירות%'
)
DELETE FROM events e
WHERE e.id IN (SELECT id FROM ranked WHERE rn > 6);

-- אימות בתוך הטרנזקציה: אמור להישאר עד 6 שורות
SELECT COUNT(*) AS remaining FROM events e
LEFT JOIN customers c ON c.id = e.customer_id
WHERE e.title ILIKE '%גלים תיירות%' OR c.name ILIKE '%גלים תיירות%';

-- אם הספירה היא 6 (או פחות) — אשר את הטרנזקציה:
COMMIT;
-- אם משהו לא נראה טוב — בטל ע"י החלפת COMMIT ב:
-- ROLLBACK;


-- =============================================================================
-- שלב 3 (אופציונלי): שחזור מגיבוי במקרה הצורך
-- =============================================================================
-- INSERT INTO events
-- SELECT * FROM events_galim_backup_20260518
-- ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- שלב 4 (אחרי שאתה בטוח שהכל תקין — אופציונלי): מחיקת טבלת הגיבוי
-- =============================================================================
-- DROP TABLE events_galim_backup_20260518;
