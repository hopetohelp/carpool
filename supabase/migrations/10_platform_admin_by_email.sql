-- ============================================================================
-- הרשאת מנהל מערכת מראש, לפי כתובת מייל
--
-- הבעיה: כדי למנות מנהל מערכת היה צריך את מזהה החשבון שלו, כלומר הוא היה
-- חייב להירשם קודם. אבל בלי מנהל מערכת אי אפשר לאשר פתיחת ארגונים — כך
-- שההפעלה הראשונה נתקעה בסדר פעולות מסורבל.
--
-- הפתרון: מאשרים כתובת מייל מראש. ברגע שמישהו נכנס עם הכתובת הזו הוא מקבל
-- את ההרשאה, בין אם החשבון נוצר לפני הרישום ובין אם אחריו.
--
-- ההרשאה נבדקת מול הכתובת שרשומה בחשבון עצמו, ולא מול מה שהמשתמש מצהיר,
-- ולכן אי אפשר להתחזות לכתובת מאושרת.
-- ============================================================================

create table if not exists platform_admin_emails (
  email    text primary key,
  added_at timestamptz not null default now()
);
alter table platform_admin_emails enable row level security;
alter table platform_admin_emails force row level security;
revoke all on table platform_admin_emails from anon, authenticated;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select
    exists (select 1 from platform_admins where user_id = auth.uid())
    or exists (
      select 1
        from auth.users u
        join platform_admin_emails e on lower(e.email) = lower(u.email)
       where u.id = auth.uid()
    )
$$;
grant execute on function is_platform_admin() to authenticated;
