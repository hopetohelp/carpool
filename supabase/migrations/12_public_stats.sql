-- ============================================================================
-- מונים ציבוריים למסך הכניסה
--
-- הכלל בכלי הוא "בלי כניסה, אפס גישה", ולכן לאיש אנונימי אין הרשאה על אף
-- טבלה. הדשבורד במסך הכניסה לא שובר את הכלל: הוא לא מקבל גישה לטבלאות
-- אלא לפונקציה אחת שמחזירה ארבעה מספרים ותו לא.
--
-- מה אי אפשר להסיק מהמספרים: מי רשום, לאיזה ארגון, מתי נסע, ומי חייב למי.
-- סכום החיובים הוא סך הכל אחד לכל המערכת, בלי פילוח לאדם או לארגון.
-- הפונקציה לא מקבלת שום קלט, ולכן אי אפשר לשאול אותה שאלה ממוקדת.
-- ============================================================================

create or replace function public_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'orgs',    (select count(*) from orgs),
    'members', (select count(*) from members where status = 'active'),
    'rides',   (select count(*) from rides where status <> 'cancelled'),
    'charged', (select coalesce(sum(amount), 0) from charges)
  )
$$;

revoke all on function public_stats() from public;
grant execute on function public_stats() to anon, authenticated;
