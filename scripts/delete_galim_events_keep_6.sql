-- =============================================================================
-- מחיקת אירועי "גלים תיירות" — נשארים בדיוק 6 אירועים
-- הרץ ב-Supabase → SQL Editor
--
-- נשמרים: 6 האירועים עם תאריך האירוע הכי מאוחר (ואז לפי id).
-- אם יש פחות מ-6 התאמות — לא יימחק כלום.
-- =============================================================================

-- שלב 1 (אופציונלי): תצוגה מקדימה — כמה שורות ואילו
SELECT e.id, e.title, e.date::text, e.customer_id, c.name AS customer_name
FROM events e
LEFT JOIN customers c ON c.id = e.customer_id
WHERE
  e.title ILIKE '%גלים תיירות%'
  OR c.name ILIKE '%גלים תיירות%'
ORDER BY e.date DESC NULLS LAST, e.id DESC;

-- שלב 2: מחיקה (הרץ רק אחרי שבדקת את התוצאה למעלה)
WITH ranked AS (
  SELECT
    e.id,
    ROW_NUMBER() OVER (
      ORDER BY e.date DESC NULLS LAST, e.id DESC
    ) AS rn
  FROM events e
  LEFT JOIN customers c ON c.id = e.customer_id
  WHERE
    e.title ILIKE '%גלים תיירות%'
    OR c.name ILIKE '%גלים תיירות%'
)
DELETE FROM events e
WHERE e.id IN (SELECT id FROM ranked WHERE rn > 6);

-- אימות אחרי המחיקה
-- SELECT COUNT(*) FROM events e
-- LEFT JOIN customers c ON c.id = e.customer_id
-- WHERE e.title ILIKE '%גלים תיירות%' OR c.name ILIKE '%גלים תיירות%';
