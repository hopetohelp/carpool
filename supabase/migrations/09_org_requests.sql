-- ============================================================================
-- בקשה לפתיחת ארגון, במקום קוד הקמה
--
-- מה היה: כדי לפתוח ארגון היה צריך "קוד הקמה" ששמור במסד הנתונים. משתמש
-- חדש לא היה יכול להשיג אותו משום מקום — רק מי שכבר יש לו גישה למסד ידע
-- מהו. כלומר הדלת הייתה נעולה בלי שום דרך לדפוק עליה.
--
-- מה יש עכשיו: כל מי שמחובר יכול לבקש לפתוח ארגון. הבקשה נכנסת לתור,
-- ומנהל מערכת מאשר או דוחה. באישור הארגון נוצר והמבקש הופך למנהל שלו.
--
-- מנהל מערכת הוא תפקיד מעל הארגונים, ולא זהה למנהל ארגון. את המנהל הראשון
-- מוסיפים פעם אחת ישירות במסד (ראו מדריך ההקמה) — זו פעולת הפעלה של מי
-- שמתפעל את המערכת, ולא משהו שמשתמש רגיל אמור לעשות.
-- ============================================================================

-- ---------- 1. מנהלי מערכת ----------
create table if not exists platform_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
alter table platform_admins force row level security;
revoke all on table platform_admins from anon, authenticated;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;
grant execute on function is_platform_admin() to authenticated;

-- ---------- 2. תור הבקשות ----------
create table if not exists org_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  org_name       text not null,
  join_code      text not null,
  requester_name text not null,
  phone          text,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  reason         text,
  org_id         uuid references orgs(id),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid
);
create unique index if not exists org_requests_one_open
  on org_requests(user_id) where status = 'pending';

alter table org_requests enable row level security;
revoke all on table org_requests from anon;

-- כל אחד רואה את הבקשה של עצמו בלבד; מנהל מערכת רואה את כולן
drop policy if exists org_requests_read on org_requests;
create policy org_requests_read on org_requests for select to authenticated
  using (user_id = auth.uid() or is_platform_admin());

-- ---------- 3. הגשת בקשה ----------
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

-- ---------- 4. הכרעה בבקשה ----------
create or replace function decide_org_request(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r org_requests; v_org uuid; v_member uuid;
begin
  if not is_platform_admin() then
    raise exception 'רק מנהל מערכת יכול להכריע בבקשות';
  end if;

  select * into r from org_requests where id = p_id for update;
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status <> 'pending' then raise exception 'הבקשה כבר טופלה'; end if;

  if not p_approve then
    update org_requests
       set status = 'rejected', reason = nullif(trim(coalesce(p_reason,'')), ''),
           decided_at = now(), decided_by = auth.uid()
     where id = p_id;
    return null;
  end if;

  -- בין ההגשה לאישור מישהו אחר עלול היה לתפוס את הקוד או שהמבקש הצטרף לארגון
  if exists (select 1 from orgs where upper(join_code) = r.join_code) then
    raise exception 'הקוד כבר תפוס בינתיים. צריך לדחות את הבקשה ולבקש קוד אחר.';
  end if;
  if exists (select 1 from members where user_id = r.user_id) then
    raise exception 'המבקש כבר משויך לארגון בינתיים';
  end if;

  insert into orgs(name, join_code) values (r.org_name, r.join_code)
  returning id into v_org;

  insert into members(org_id, user_id, name, role, status, is_driver)
  values (v_org, r.user_id, r.requester_name, 'manager', 'active', true)
  returning id into v_member;

  insert into member_contacts(member_id, org_id, phone, email)
  values (v_member, v_org, r.phone, auth_email_of(r.user_id));

  update org_requests
     set status = 'approved', org_id = v_org,
         decided_at = now(), decided_by = auth.uid()
   where id = p_id;

  return v_org;
end $$;

revoke all on function request_org(text,text,text,text)        from public, anon;
revoke all on function decide_org_request(uuid,boolean,text)   from public, anon;
grant execute on function request_org(text,text,text,text)      to authenticated;
grant execute on function decide_org_request(uuid,boolean,text) to authenticated;

-- ---------- 5. קוד ההקמה כבר לא בשימוש ----------
-- create_org הישנה נשארת רק כדי לא לשבור התקנות קיימות, ואינה נגישה יותר
-- מהממשק. מסלול פתיחת ארגון היחיד הוא request_org ואישור מנהל מערכת.
revoke execute on function create_org(text,text,text,text,text) from authenticated;
delete from app_config where key = 'setup_code';
