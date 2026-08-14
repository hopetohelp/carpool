-- ============================================================================
-- שליחת ההתראות שממתינות בתור
--
-- הפרדה מכוונת: המשימה המתוזמנת רק "מעירה" את פונקציית השרת, והפונקציה
-- היא זו ששולחת בפועל. כך אפשר להפעיל שליחה ידנית לבדיקה בלי לגעת בתזמון.
--
-- טבלת app_config מחזיקה את המפתחות (Resend, VAPID, סוד המשימה, קוד ההקמה).
-- אין לה מדיניות גישה כלל ואף תפקיד לא קיבל עליה הרשאות — כלומר רק השרת
-- עצמו יכול לקרוא אותה. הערכים עצמם לא נשמרים בקוד ולא בהיסטוריית הגרסאות.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

create table if not exists app_config (
  key   text primary key,
  value text not null
);
alter table app_config enable row level security;
alter table app_config force row level security;
revoke all on table app_config from anon, authenticated;

-- ערכים שצריך למלא בהקמה (ראו docs/04-מדריך-הקמה.md):
--   setup_code     — קוד להקמת ארגון חדש
--   cron_secret    — סוד שמאמת שהקריאה הגיעה מהמשימה המתוזמנת
--   functions_url  — כתובת פונקציות השרת
--   app_url        — כתובת האתר, לקישורים במיילים ובהתראות
--   resend_api_key, mail_from        — שליחת מייל
--   vapid_public, vapid_private, vapid_subject — התראות דחיפה
insert into app_config(key, value)
values ('setup_code',  upper(substring(encode(gen_random_bytes(8),'hex') from 1 for 10))),
       ('cron_secret', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function job_dispatch_notifications() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text; v_id bigint;
begin
  select value into v_secret from app_config where key = 'cron_secret';
  select value into v_url    from app_config where key = 'functions_url';
  if v_secret is null or v_url is null then return null; end if;

  -- אין מה לשלוח — לא מעירים את הפונקציה לחינם
  if not exists (
    select 1 from notifications
    where email_status = 'pending' or push_status = 'pending'
  ) then
    return null;
  end if;

  select net.http_post(
    url     := v_url || '/send-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_secret),
    body    := '{}'::jsonb
  ) into v_id;
  return v_id;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-notifications';
select cron.schedule('dispatch-notifications', '* * * * *',
                     $$select job_dispatch_notifications()$$);
