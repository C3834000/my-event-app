-- מיגרציה 003: תאריך פוקוס יומי למשימה
-- לא הורץ. להרצה ידנית ב-Supabase SQL Editor אחרי אישור.
-- מוסיף עמודה ריקה בלבד. לא מוחק ולא משנה משימות קיימות.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS focus_date date null;
