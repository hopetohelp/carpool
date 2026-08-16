-- ============================================================================
-- מסך מנהל המערכת: ארגונים, משתמשים, השהיה ומחיקה
--
-- מה היה: למנהל המערכת היה מסך אחד בלבד — אישור בקשות לפתיחת ארגון. אחרי
-- שארגון נפתח לא הייתה שום דרך לראות אותו, לעצור אותו או למחוק אותו, חוץ
-- מגישה ישירה למסד הנתונים.
--
-- מה יש עכשיו: רשימת כל הארגונים ורשימת כל המשתמשים, עם נתוני שימוש, ועם
-- אפשרות להשהות ולמחוק.
--
-- העיקרון שמנחה את הקובץ: מנהל המערכת לא מקבל הרשאת קריאה על אף טבלה.
-- הוא מקבל פונקציות. כל פונקציה כאן בודקת `is_platform_admin()` בשורה
-- הראשונה שלה, ולכן מי שאינו מנהל מערכת מקבל שגיאה גם אם יקרא לה ישירות
-- מהדפדפן, מהטרמינל או מכל כלי אחר. אין תלות בכך שהממשק יסתיר כפתור.
-- ============================================================================


-- ============================================================================
-- 1. ספירת כניסות
--
-- שירות האימות שומר את מועד הכניסה האחרון בלבד, ולא כמה פעמים נכנסו. כדי
-- להראות שימוש אמיתי צריך מונה משלנו. הטבלה מכילה שורה אחת לכל חשבון ותו
-- לא — בלי כתובות, בלי מכשירים ובלי היסטוריית זמנים.
-- ============================================================================

create table if not exists user_activity (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  first_login timestamptz not null default now(),
  last_login  timestamptz not null default now(),
  login_count int not null default 1
);
alter table user_activity enable row level security;
alter table user_activity force row level security;
revoke all on table user_activity from anon, authenticated;

-- נקראת בכל פתיחה של הכלי. נספרת כניסה אחת לכל היותר בכל עשר דקות, כדי
-- שרענון של הדף או כרטיסייה שנייה לא ייספרו ככניסות נפרדות.
create or replace function record_login() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  insert into user_activity(user_id) values (v_uid)
  on conflict (user_id) do update
     set last_login  = now(),
         login_count = user_activity.login_count
                       + case when user_activity.last_login < now() - interval '10 minutes'
                              then 1 else 0 end;
end $$;

revoke all on function record_login() from public, anon;
grant execute on function record_login() to authenticated;


-- ============================================================================
-- 2. השהיה
--
-- השהיה היא לא מחיקה: הנתונים נשארים במקומם, והגישה נעצרת. אפשר להחזיר
-- אותה בלחיצה. זו הפעולה הנכונה כשצריך לעצור משהו לפני שמבינים מה קרה.
--
-- ההשהיה נאכפת במקום אחד — בשלוש פונקציות העזר שכל מדיניות ההרשאות בכלי
-- נשענת עליהן. כך אין צורך לשנות עשרות מדיניות, ואי אפשר לשכוח אחת מהן.
-- ============================================================================

alter table orgs add column if not exists suspended_at timestamptz;

create table if not exists suspended_users (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  suspended_at timestamptz not null default now(),
  suspended_by uuid,
  reason       text
);
alter table suspended_users enable row level security;
alter table suspended_users force row level security;
revoke all on table suspended_users from anon, authenticated;

-- ---------- אכיפה: חשבון מושהה, או ארגון מושהה, מאבד גישה לכל הטבלאות ----------

create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.id
    from members m
    join orgs o on o.id = m.org_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and o.suspended_at is null
     and not exists (select 1 from suspended_users s where s.user_id = m.user_id)
   limit 1
$$;

create or replace function current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.org_id
    from members m
    join orgs o on o.id = m.org_id
   where m.user_id = auth.uid()
     and m.status = 'active'
     and o.suspended_at is null
     and not exists (select 1 from suspended_users s where s.user_id = m.user_id)
   limit 1
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from members m
      join orgs o on o.id = m.org_id
     where m.user_id = auth.uid()
       and m.status = 'active'
       and m.role = 'manager'
       and o.suspended_at is null
       and not exists (select 1 from suspended_users s where s.user_id = m.user_id)
  )
$$;

-- ---------- שומר עמודה: ההשהיה אינה בידי הארגון ----------
-- הגנת השורות מרשה למנהל ארגון לעדכן את שורת הארגון שלו, וזה כולל כל עמודה
-- בה. בלי השומר הזה מנהל ארגון היה יכול לשלוח מהדפדפן עדכון של `suspended_at`
-- — ולנעול את הארגון שלו בעצמו בלי דרך חזרה, כי אחרי ההשהיה הוא כבר לא
-- מנהל בעיני ההרשאות. אותו עיקרון בדיוק כמו שאר השומרים בקובץ 05.
create or replace function orgs_guard() returns trigger
language plpgsql as $$
begin
  if not guard_active() then return new; end if;
  if new.suspended_at is distinct from old.suspended_at then
    raise exception 'השהיית ארגון היא בידי מנהל מערכת בלבד';
  end if;
  return new;
end $$;

drop trigger if exists orgs_guard_trg on orgs;
create trigger orgs_guard_trg before update on orgs
for each row execute function orgs_guard();

-- ---------- הסבר למשתמש עצמו ----------
-- בלי זה מי שהושהה היה רואה כלי ריק בלי שום הסבר, או נזרק למסך ההצטרפות
-- ושם נתקע ב"החשבון הזה כבר משויך לארגון". הפונקציה מחזירה מילה אחת,
-- ולא מגלה דבר על אף אחד אחר.
create or replace function account_status() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'anon'
    when exists (select 1 from suspended_users s where s.user_id = auth.uid())
      then 'user_suspended'
    when exists (
      select 1 from members m join orgs o on o.id = m.org_id
       where m.user_id = auth.uid() and o.suspended_at is not null
    ) then 'org_suspended'
    else 'ok'
  end
$$;

revoke all on function account_status() from public, anon;
grant execute on function account_status() to authenticated;

-- ---------- חשבון מושהה לא מצטרף ולא מבקש לפתוח ארגון ----------
-- בלי החסימה הזו מי שהושהה היה יכול לעקוף אותה בהצטרפות מחדש.

create or replace function assert_not_suspended() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from suspended_users where user_id = auth.uid()) then
    raise exception 'החשבון הזה מושהה. אפשר לפנות למי שמתפעל את המערכת.';
  end if;
end $$;

create or replace function join_org(
  p_join_code text, p_name text, p_phone text default null, p_is_driver boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid; v_member uuid; v_first boolean; v_auto boolean; v_suspended timestamptz;
begin
  if v_uid is null then raise exception 'צריך להיות מחובר כדי להצטרף'; end if;
  perform assert_not_suspended();
  if exists (select 1 from members where user_id = v_uid) then
    raise exception 'החשבון הזה כבר משויך לארגון';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'צריך למלא שם תצוגה'; end if;

  select id, coalesce((settings->>'auto_approve_members')::boolean, false), suspended_at
    into v_org, v_auto, v_suspended
    from orgs where upper(join_code) = upper(trim(p_join_code));

  if v_org is null then
    raise exception 'קוד הארגון לא נמצא. כדאי לבדוק את הקוד מול מי שהזמין אותך.';
  end if;
  if v_suspended is not null then
    raise exception 'הארגון הזה מושהה כרגע ואי אפשר להצטרף אליו.';
  end if;

  -- הראשון בארגון ריק הוא תמיד מנהל פעיל, בלי קשר להגדרה
  select not exists (select 1 from members where org_id = v_org) into v_first;

  insert into members(org_id, user_id, name, role, status, is_driver)
  values (v_org, v_uid, trim(p_name),
          case when v_first then 'manager' else 'member' end::member_role,
          case when v_first or v_auto then 'active' else 'pending' end::member_status,
          coalesce(p_is_driver, false))
  returning id into v_member;

  insert into member_contacts(member_id, org_id, phone, email)
  values (v_member, v_org, nullif(trim(coalesce(p_phone,'')), ''), auth_email_of(v_uid));

  return v_member;
end $$;

revoke all on function join_org(text,text,text,boolean) from public, anon;
grant execute on function join_org(text,text,text,boolean) to authenticated;

create or replace function request_org(
  p_org_name  text,
  p_join_code text,
  p_name      text,
  p_phone     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text;
begin
  if v_uid is null then raise exception 'צריך להיות מחובר'; end if;
  perform assert_not_suspended();

  if exists (select 1 from members where user_id = v_uid) then
    raise exception 'החשבון הזה כבר משויך לארגון';
  end if;
  if exists (select 1 from org_requests where user_id = v_uid and status = 'pending') then
    raise exception 'כבר יש לך בקשה שממתינה לאישור';
  end if;
  if length(trim(coalesce(p_org_name,''))) < 2 then
    raise exception 'צריך למלא שם ארגון';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'צריך למלא שם';
  end if;

  v_code := upper(trim(p_join_code));
  if v_code !~ '^[A-Z0-9]{4,20}$' then
    raise exception 'קוד הצוות יכול להכיל אותיות באנגלית וספרות בלבד';
  end if;
  if exists (select 1 from orgs where upper(join_code) = v_code)
     or exists (select 1 from org_requests where join_code = v_code and status = 'pending') then
    raise exception 'הקוד הזה כבר תפוס. אפשר ליצור קוד אחר.';
  end if;

  insert into org_requests(user_id, org_name, join_code, requester_name, phone)
  values (v_uid, trim(p_org_name), v_code, trim(p_name),
          nullif(trim(coalesce(p_phone,'')), ''))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function request_org(text,text,text,text) from public, anon;
grant execute on function request_org(text,text,text,text) to authenticated;


-- ============================================================================
-- 3. מה מנהל המערכת רואה
--
-- שלוש פונקציות קריאה. כולן security definer — כלומר הן קוראות את הנתונים
-- בזכויות המערכת ולא בזכויות הקורא — ולכן השורה הראשונה בכל אחת מהן היא
-- בדיקת ההרשאה. בלעדיה הן היו דלת אחורית לכל המסד.
-- ============================================================================

create or replace function admin_list_orgs()
returns table (
  id             uuid,
  name           text,
  join_code      text,
  created_at     timestamptz,
  suspended_at   timestamptz,
  members_total  bigint,
  members_active bigint,
  members_pending bigint,
  logins         bigint,
  rides          bigint,
  rides_closed   bigint,
  last_ride_at   timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;
  return query
    select
      o.id, o.name, o.join_code, o.created_at, o.suspended_at,
      (select count(*) from members m where m.org_id = o.id),
      (select count(*) from members m where m.org_id = o.id and m.status = 'active'),
      (select count(*) from members m where m.org_id = o.id and m.status = 'pending'),
      (select coalesce(sum(a.login_count), 0)
         from members m join user_activity a on a.user_id = m.user_id
        where m.org_id = o.id),
      (select count(*) from rides r where r.org_id = o.id and r.status <> 'cancelled'),
      (select count(*) from rides r where r.org_id = o.id and r.status = 'closed'),
      (select max(r.departs_at) from rides r where r.org_id = o.id and r.status <> 'cancelled')
    from orgs o
    order by o.created_at desc;
end $$;

-- רשימת המשתמשים. p_org מסנן לארגון אחד — כך אותה פונקציה משמשת גם את
-- הרשימה הכללית וגם את מסך הצפייה בארגון בודד.
create or replace function admin_list_users(p_org uuid default null)
returns table (
  user_id       uuid,
  email         text,
  display_name  text,
  created_at    timestamptz,
  last_login    timestamptz,
  login_count   int,
  suspended_at  timestamptz,
  is_admin      boolean,
  org_id        uuid,
  org_name      text,
  member_status text,
  member_role   text,
  rides_driven  bigint,
  rides_taken   bigint
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;
  return query
    select
      u.id,
      u.email::text,
      coalesce(
        m.name,
        nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',
                             u.raw_user_meta_data->>'name', '')), '')
      )::text,
      u.created_at,
      greatest(u.last_sign_in_at, a.last_login),
      coalesce(a.login_count, 0),
      s.suspended_at,
      (exists (select 1 from platform_admins pa where pa.user_id = u.id)
       or exists (select 1 from platform_admin_emails pe where lower(pe.email) = lower(u.email))),
      m.org_id,
      o.name::text,
      m.status::text,
      m.role::text,
      (select count(*) from rides r
        where r.driver_id = m.id and r.status <> 'cancelled'),
      (select count(*) from bookings b
        where b.passenger_id = m.id and b.status in ('approved','rode'))
    from auth.users u
    left join members         m on m.user_id = u.id
    left join orgs            o on o.id = m.org_id
    left join user_activity   a on a.user_id = u.id
    left join suspended_users s on s.user_id = u.id
   where p_org is null or m.org_id = p_org
   order by u.created_at desc;
end $$;

-- תמונת מצב של ארגון בודד, למסך הצפייה
create or replace function admin_org_detail(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;

  select jsonb_build_object(
    'id',             o.id,
    'name',           o.name,
    'join_code',      o.join_code,
    'created_at',     o.created_at,
    'suspended_at',   o.suspended_at,
    'opened_by',      (select q.requester_name from org_requests q
                        where q.org_id = o.id order by q.decided_at limit 1),
    'members_total',  (select count(*) from members m where m.org_id = o.id),
    'members_active', (select count(*) from members m where m.org_id = o.id and m.status = 'active'),
    'members_pending',(select count(*) from members m where m.org_id = o.id and m.status = 'pending'),
    'members_blocked',(select count(*) from members m where m.org_id = o.id and m.status = 'blocked'),
    'drivers',        (select count(*) from members m where m.org_id = o.id and m.is_driver),
    'logins',         (select coalesce(sum(a.login_count), 0)
                         from members m join user_activity a on a.user_id = m.user_id
                        where m.org_id = o.id),
    'rides',          (select count(*) from rides r where r.org_id = o.id and r.status <> 'cancelled'),
    'rides_closed',   (select count(*) from rides r where r.org_id = o.id and r.status = 'closed'),
    'rides_cancelled',(select count(*) from rides r where r.org_id = o.id and r.status = 'cancelled'),
    'bookings',       (select count(*) from bookings b where b.org_id = o.id
                        and b.status in ('approved','rode')),
    'charged',        (select coalesce(sum(c.amount), 0) from charges c where c.org_id = o.id),
    'stops',          (select count(*) from stops st where st.org_id = o.id and st.active),
    'last_ride_at',   (select max(r.departs_at) from rides r
                        where r.org_id = o.id and r.status <> 'cancelled')
  )
  into v
  from orgs o where o.id = p_org;

  if v is null then raise exception 'הארגון לא נמצא'; end if;
  return v;
end $$;


-- ============================================================================
-- 4. מה מנהל המערכת יכול לעשות
--
-- שני מעצורי בטיחות שחוזרים בכל פעולה:
--   · אי אפשר לפעול על החשבון של עצמך — אחרת אפשר להינעל בחוץ בטעות.
--   · אי אפשר לפעול על חשבון של מנהל מערכת אחר — מינוי והסרה של מנהלי
--     מערכת נעשים במסד הנתונים בלבד, וזה נשאר כך.
-- ============================================================================

create or replace function admin_set_org_suspended(p_org uuid, p_suspended boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;

  update orgs set suspended_at = case when p_suspended then now() else null end
   where id = p_org;
  if not found then raise exception 'הארגון לא נמצא'; end if;

  insert into audit_log(org_id, actor_id, entity, entity_id, action, detail)
  values (p_org, auth.uid(), 'org', p_org,
          case when p_suspended then 'platform_suspend' else 'platform_resume' end,
          '{}'::jsonb);
end $$;

create or replace function admin_delete_org(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text; v_members bigint; v_rides bigint;
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;

  select o.name into v_name from orgs o where o.id = p_org;
  if v_name is null then raise exception 'הארגון לא נמצא'; end if;

  if exists (select 1 from members m where m.org_id = p_org and m.user_id = auth.uid()) then
    raise exception 'אי אפשר למחוק ארגון שאתה עצמך חבר בו';
  end if;

  select count(*) into v_members from members m where m.org_id = p_org;
  select count(*) into v_rides   from rides   r where r.org_id = p_org;

  -- טבלת הבקשות שומרת הפניה לארגון שנפתח, בלי מחיקה משורשרת. משחררים אותה
  -- כדי שההיסטוריה תישאר ולא תחסום את המחיקה.
  update org_requests set org_id = null where org_id = p_org;

  -- כל שאר הטבלאות תלויות בארגון במחיקה משורשרת: חברים, נסיעות, הרשמות,
  -- חיובים, תשלומים, התראות ונקודות איסוף נמחקים איתו.
  delete from orgs where id = p_org;

  insert into audit_log(org_id, actor_id, entity, entity_id, action, detail)
  values (null, auth.uid(), 'org', p_org, 'platform_delete',
          jsonb_build_object('members', v_members, 'rides', v_rides));

  return jsonb_build_object('name', v_name, 'members', v_members, 'rides', v_rides);
end $$;

create or replace function admin_set_user_suspended(
  p_user uuid, p_suspended boolean, p_reason text default null
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;
  if p_user = auth.uid() then raise exception 'אי אפשר להשהות את החשבון של עצמך'; end if;

  if p_suspended and (
       exists (select 1 from platform_admins pa where pa.user_id = p_user)
    or exists (select 1 from auth.users u join platform_admin_emails pe
                 on lower(pe.email) = lower(u.email) where u.id = p_user)
  ) then
    raise exception 'אי אפשר להשהות חשבון של מנהל מערכת';
  end if;

  if p_suspended then
    insert into suspended_users(user_id, suspended_by, reason)
    values (p_user, auth.uid(), nullif(trim(coalesce(p_reason,'')), ''))
    on conflict (user_id) do update
       set suspended_at = now(), suspended_by = auth.uid(),
           reason = excluded.reason;
  else
    delete from suspended_users where user_id = p_user;
  end if;

  insert into audit_log(org_id, actor_id, entity, entity_id, action, detail)
  values (null, auth.uid(), 'user', p_user,
          case when p_suspended then 'platform_suspend' else 'platform_resume' end,
          '{}'::jsonb);
end $$;

-- מוחקת את כל מה שהמשתמש עשה בכלי. חשבון הכניסה עצמו נמחק אחר כך בפונקציית
-- השרת, כי רק לה יש הרשאה לגעת בשירות האימות. עד שזה קורה החשבון מסומן
-- כמושהה — כדי שלא ייווצר מצב ביניים שבו אפשר להיכנס איתו ולהתחיל מחדש.
create or replace function admin_delete_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_name text; v_orphans text[]; v_members bigint;
begin
  if not is_platform_admin() then raise exception 'אין לך הרשאה'; end if;
  if p_user = auth.uid() then raise exception 'אי אפשר למחוק את החשבון של עצמך'; end if;

  if exists (select 1 from platform_admins pa where pa.user_id = p_user)
     or exists (select 1 from auth.users u join platform_admin_emails pe
                  on lower(pe.email) = lower(u.email) where u.id = p_user) then
    raise exception 'אי אפשר למחוק חשבון של מנהל מערכת';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'החשבון לא נמצא';
  end if;

  select max(m.name) into v_name from members m where m.user_id = p_user;

  -- ארגונים שיישארו בלי אף מנהל פעיל. לא חוסמים את המחיקה, אבל מדווחים
  -- עליהם — ארגון בלי מנהל צריך טיפול, ואסור שזה יקרה בשקט.
  select array_agg(distinct o.name) into v_orphans
    from members m
    join orgs o on o.id = m.org_id
   where m.user_id = p_user and m.role = 'manager' and m.status = 'active'
     and not exists (
       select 1 from members m2
        where m2.org_id = m.org_id and m2.role = 'manager'
          and m2.status = 'active' and m2.user_id is distinct from p_user
     );

  select count(*) into v_members from members m where m.user_id = p_user;

  delete from members where user_id = p_user;
  delete from org_requests where user_id = p_user;

  insert into suspended_users(user_id, suspended_by, reason)
  values (p_user, auth.uid(), 'ממתין למחיקת חשבון הכניסה')
  on conflict (user_id) do update set suspended_at = now();

  insert into audit_log(org_id, actor_id, entity, entity_id, action, detail)
  values (null, auth.uid(), 'user', p_user, 'platform_delete',
          jsonb_build_object('memberships', v_members));

  return jsonb_build_object(
    'name', v_name,
    'memberships', v_members,
    'orgs_without_manager', coalesce(to_jsonb(v_orphans), '[]'::jsonb)
  );
end $$;


-- ============================================================================
-- 5. הרשאות הרצה
--
-- כולן נחשפות ל-authenticated בלבד ולעולם לא ל-anon. הבדיקה האמיתית מי
-- רשאי מה נמצאת בתוך הפונקציה עצמה, וזו רק שכבה נוספת מעליה.
-- ============================================================================

do $$
declare f text;
begin
  foreach f in array array[
    'admin_list_orgs()',
    'admin_list_users(uuid)',
    'admin_org_detail(uuid)',
    'admin_set_org_suspended(uuid,boolean)',
    'admin_delete_org(uuid)',
    'admin_set_user_suspended(uuid,boolean,text)',
    'admin_delete_user(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

revoke all on function assert_not_suspended() from public, anon, authenticated;
