-- ============================================================================
-- כלי הבדיקה
--
-- שלוש פונקציות ותו לא, כדי שכל בדיקה תיקרא כמו משפט אחד בעברית: מה נבדק,
-- ומה היה אמור לקרות. התוצאות נאספות לטבלה, והקובץ האחרון מכריע אם הריצה
-- עברה או נכשלה — כדי שכישלון ייעצור אוטומטית ולא יחכה שמישהו יקרא פלט.
-- ============================================================================

create table t_results (
  id     serial primary key,
  suite  text not null,
  name   text not null,
  passed boolean not null,
  detail text
);

/** רושמת תוצאה של בדיקה בודדת */
create or replace function t_check(
  p_suite text, p_name text, p_passed boolean, p_detail text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- תנאי ריק הוא כישלון ולא "לא ידוע": בפועל זה כמעט תמיד אומר שהשאילתה
  -- לא מצאה את השורה שהבדיקה חיפשה, וזו בדיוק תקלה שצריך לראות.
  insert into t_results(suite, name, passed, detail)
  values (p_suite, p_name, coalesce(p_passed, false),
          coalesce(p_detail, case when p_passed is null then 'התנאי החזיר ריק — כנראה לא נמצאה שורה' end));
  raise notice '%  %', case when p_passed then '✓' else '✗ נכשלה:' end, p_name;
end $$;

/**
 * סופרת שורות שהשאילתה מחזירה בזכויות הקורא.
 * security invoker (ברירת המחדל) — אחרת הבדיקה הייתה רצה בזכויות המערכת
 * ומחזירה תמיד את כל הנתונים, כלומר בודקת כלום.
 */
create or replace function t_count(p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') _t' into n;
  return n;
end $$;

/**
 * מריצה פקודה שאמורה להיחסם. עוברת רק אם היא נכשלה, ורושמת את הודעת
 * החסימה — כך שרואים גם *למה* נחסמה, ולא רק שנחסמה.
 */
create or replace function t_denied(p_suite text, p_name text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform t_check(p_suite, p_name, false, 'הפעולה הצליחה למרות שהייתה אמורה להיחסם');
exception when others then
  perform t_check(p_suite, p_name, true, sqlerrm);
end $$;

/** ההפך מ-t_denied: פקודה שחייבת לעבור, ואם נכשלה רואים למה */
create or replace function t_allowed(p_suite text, p_name text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  perform t_check(p_suite, p_name, true);
exception when others then
  perform t_check(p_suite, p_name, false, sqlerrm);
end $$;

/** מחליפה זהות: מכאן והלאה auth.uid() מחזירה את המשתמש הזה */
create or replace function t_login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
end $$;

grant execute on function t_check(text,text,boolean,text) to anon, authenticated;
grant execute on function t_count(text)                   to anon, authenticated;
grant execute on function t_denied(text,text,text)        to anon, authenticated;
grant execute on function t_allowed(text,text,text)       to anon, authenticated;
grant execute on function t_login(uuid)                   to anon, authenticated;
