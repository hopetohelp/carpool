-- ============================================================================
-- סביבת הבדיקה: מה ש-Supabase מספק ואין ב-Postgres רגיל
--
-- הקובץ הזה אינו חלק מהכלי ואינו רץ לעולם על מסד הנתונים האמיתי. תפקידו
-- היחיד הוא לבנות מסד נקי שנראה מספיק כמו Supabase כדי שהמיגרציות האמיתיות
-- ירוצו עליו כמו שהן — אותם תפקידים, אותה סכמת auth, ואותן הרשאות ברירת
-- מחדל. כך הבדיקות בודקות את הקבצים שבאמת נפרסים, ולא העתק שלהם.
-- ============================================================================

-- ---------- תפקידים ----------
do $r$ begin create role anon          nologin; exception when duplicate_object then null; end $r$;
do $r$ begin create role authenticated nologin; exception when duplicate_object then null; end $r$;
do $r$ begin create role service_role  nologin; exception when duplicate_object then null; end $r$;

grant usage on schema public to anon, authenticated, service_role;

-- ב-Supabase כל טבלה חדשה בסכמה הציבורית מקבלת אוטומטית הרשאות לשלושת
-- התפקידים. בלי זה המיגרציות היו "מבטלות" הרשאות שמעולם לא ניתנו, והבדיקה
-- הייתה מחמיאה לעצמה.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- תפקיד הבעלים ב-Supabase רשאי לעקוף הגנת שורות, וזה מה שמאפשר לפונקציות
-- security definer לעבוד. בלעדיו הפונקציות העסקיות היו נכשלות כאן ורק כאן.
alter role postgres bypassrls;

-- ---------- סכמת האימות ----------
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists cron;
create schema if not exists net;
create extension if not exists pgcrypto with schema public;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              varchar(255) unique,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- הזהות בבדיקה נקבעת מהגדרת סשן, בדיוק כמו שהיא נקבעת מהאסימון באמת
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- ---------- תחליפים למשימות מתוזמנות ולקריאות רשת ----------
-- pg_cron ו-pg_net קיימים רק ב-Supabase. הבדיקות לא נוגעות בהם, ומספיק
-- שהמיגרציות יוכלו לקרוא להם בלי להיכשל.
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);

create or replace function cron.schedule(p_name text, p_sched text, p_cmd text) returns bigint
language sql as $$
  insert into cron.job(jobname, schedule, command) values (p_name, p_sched, p_cmd) returning jobid
$$;

create or replace function cron.unschedule(p_id bigint) returns boolean
language sql as $$ delete from cron.job where jobid = p_id returning true $$;

create or replace function net.http_post(
  url text, body jsonb, headers jsonb, timeout_milliseconds int default 5000
) returns bigint language sql as $$ select 1::bigint $$;
