-- כיוון שלישי למסמכים: 'tracking' (מעקב) — מסמכים שחשוב לשמור ולסכם בנפרד
-- (למשל: חשבוניות של חיים/חוה שפירא לגורמים שלישיים על מוצרי קליקריים),
-- אבל אינם הוצאה של העסק ולא נספרים בחישובי מע"מ/מס.
alter table documents drop constraint if exists documents_direction_check;
alter table documents add constraint documents_direction_check
  check (direction in ('income', 'expense', 'tracking'));
