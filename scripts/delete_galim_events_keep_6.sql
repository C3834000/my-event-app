-- =============================================================================
-- מחיקת אירועי "גלים תיירות" — נשארים רק 6 האירועים האחרונים שנוספו למערכת
-- הרץ ב-Supabase → SQL Editor
--
-- סדר שמירה: created_at (הכי חדש קודם) → תאריך האירוע → id
-- אם אין created_at בשורה — מתייחסים לתאריך האירוע ול-id.
-- אם יש 6 או פחות התאמות — לא יימחק כלום.
-- =============================================================================

-- שלב 1: תצוגה מקדימה — אלו 6 יישמרו (שורות ראשונות), השאר יימחקו
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

-- שלב 2: מחיקה — רק אחרי שבדקת שהשורות עם will_keep_rank 1–6 הן הנכונות
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

-- אימות: אמור להישאר עד 6 שורות
-- SELECT COUNT(*) FROM events e
-- LEFT JOIN customers c ON c.id = e.customer_id
-- WHERE e.title ILIKE '%גלים תיירות%' OR c.name ILIKE '%גלים תיירות%';
