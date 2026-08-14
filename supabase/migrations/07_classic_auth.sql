-- ============================================================================
-- כניסה קלאסית
--
-- המודל הקודם: מזהה הכניסה נגזר מ-(קוד הארגון + השם), והקוד האישי שימש סיסמה.
-- זה עבד, אבל דרש מהמשתמש להבין שלושה מושגים חדשים כדי להיכנס, השם הפך
-- למזהה קבוע שאי אפשר לתקן, ולא הייתה שום דרך לשחזר קוד שנשכח.
--
-- המודל החדש: כניסה רגילה — חשבון Google או מייל וסיסמה. הזהות היא החשבון,
-- לא השם. קוד הארגון נשאר, אבל הוא נדרש רק פעם אחת בהצטרפות, אחרי הכניסה,
-- ולא בכל התחברות.
--
-- מה זה מאפשר שלא היה קודם: שחזור סיסמה, שינוי שם תצוגה, שני אנשים באותו שם,
-- וכניסה בלחיצה אחת בלי לזכור כלום.
-- ============================================================================

-- ---------- 1. השם והמזהה הישן כבר אינם זהות ----------
alter table members alter column login_key drop not null;
alter table members drop constraint if exists members_org_id_login_key_key;
alter table members drop constraint if exists members_org_id_name_key;

comment on column members.login_key is
  'שריד מהמודל הישן. נשאר כדי לא לאבד היסטוריה; אין לו שימוש בקוד החדש.';

-- ---------- 2. עדכון שומר הסף ----------
-- השם כבר לא משמש לכניסה, ולכן מותר לאדם לתקן את שם התצוגה של עצמו.
-- מה שלא משתנה: הארגון, מזהה החשבון, והתפקיד/סטטוס בידי מי שאינו מנהל.
create or replace function members_guard() returns trigger
language plpgsql as $$
declare v_mgr boolean;
begin
  if not guard_active() then return new; end if;
  v_mgr := is_manager();

  if new.org_id  is distinct from old.org_id  then raise exception 'אי אפשר להעביר חבר בין ארגונים'; end if;
  if new.user_id is distinct from old.user_id then raise exception 'אי אפשר לשנות את מזהה החשבון'; end if;

  if not v_mgr then
    if new.role   is distinct from old.role   then raise exception 'רק מנהל יכול לשנות תפקיד'; end if;
    if new.status is distinct from old.status then raise exception 'רק מנהל יכול לשנות סטטוס של חבר'; end if;
    -- שינוי שם מותר, אבל רק של עצמך
    if new.name is distinct from old.name and old.user_id is distinct from auth.uid() then
      raise exception 'אפשר לשנות רק את השם של עצמך';
    end if;
  end if;

  if old.role = 'manager' and new.role <> 'manager'
     and (select count(*) from members
          where org_id = old.org_id and role = 'manager' and status = 'active') <= 1 then
    raise exception 'זה המנהל היחיד בארגון — צריך למנות מנהל אחר לפני השינוי';
  end if;

  return new;
end $$;

-- ---------- 3. המייל של החשבון נשמר בפרטי הקשר ----------
-- כך התראות מייל עובדות מיד, בלי שהמשתמש יצטרך להקליד את הכתובת שוב.
create or replace function auth_email_of(p_user uuid) returns text
language sql stable security definer set search_path = auth, public as $$
  select email from auth.users where id = p_user
$$;

-- ---------- 4. הצטרפות לארגון (אחרי שהמשתמש כבר מחובר) ----------
create or replace function join_org(
  p_join_code text,
  p_name      text,
  p_phone     text default null,
  p_is_driver boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_member uuid; v_first boolean;
begin
  if v_uid is null then raise exception 'צריך להיות מחובר כדי להצטרף'; end if;

  if exists (select 1 from members where user_id = v_uid) then
    raise exception 'החשבון הזה כבר משויך לארגון';
  end if;

  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'צריך למלא שם תצוגה';
  end if;

  select id into v_org from orgs
   where upper(join_code) = upper(trim(p_join_code));
  if v_org is null then
    raise exception 'קוד הארגון לא נמצא. כדאי לבדוק את הקוד מול מי שהזמין אותך.';
  end if;

  -- הראשון בארגון ריק הופך למנהל פעיל; כל השאר ממתינים לאישור
  select not exists (select 1 from members where org_id = v_org) into v_first;

  insert into members(org_id, user_id, name, role, status, is_driver)
  values (v_org, v_uid, trim(p_name),
          case when v_first then 'manager' else 'member' end::member_role,
          case when v_first then 'active'  else 'pending' end::member_status,
          coalesce(p_is_driver, false))
  returning id into v_member;

  insert into member_contacts(member_id, org_id, phone, email)
  values (v_member, v_org, nullif(trim(coalesce(p_phone,'')), ''), auth_email_of(v_uid));

  return v_member;
end $$;

-- ---------- 5. הקמת ארגון חדש (אחרי שהמשתמש כבר מחובר) ----------
create or replace function create_org(
  p_org_name   text,
  p_join_code  text,
  p_name       text,
  p_setup_code text,
  p_phone      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_member uuid; v_expected text;
begin
  if v_uid is null then raise exception 'צריך להיות מחובר כדי להקים ארגון'; end if;

  select value into v_expected from app_config where key = 'setup_code';
  if v_expected is null or upper(trim(p_setup_code)) <> upper(v_expected) then
    raise exception 'קוד ההקמה שגוי';
  end if;

  if exists (select 1 from members where user_id = v_uid) then
    raise exception 'החשבון הזה כבר משויך לארגון';
  end if;

  if not (upper(trim(p_join_code)) ~ '^[A-Z0-9]{4,20}$') then
    raise exception 'קוד הארגון יכול להכיל אותיות באנגלית וספרות בלבד, בין 4 ל-20 תווים';
  end if;

  if exists (select 1 from orgs where upper(join_code) = upper(trim(p_join_code))) then
    raise exception 'קוד הארגון הזה כבר תפוס. כדאי לבחור אחר.';
  end if;

  insert into orgs(name, join_code)
  values (trim(p_org_name), upper(trim(p_join_code)))
  returning id into v_org;

  insert into members(org_id, user_id, name, role, status, is_driver)
  values (v_org, v_uid, trim(p_name), 'manager', 'active', true)
  returning id into v_member;

  insert into member_contacts(member_id, org_id, phone, email)
  values (v_member, v_org, nullif(trim(coalesce(p_phone,'')), ''), auth_email_of(v_uid));

  return v_member;
end $$;

revoke all on function join_org(text,text,text,boolean)      from public, anon;
revoke all on function create_org(text,text,text,text,text)   from public, anon;
revoke all on function auth_email_of(uuid)                    from public, anon, authenticated;
grant execute on function join_org(text,text,text,boolean)    to authenticated;
grant execute on function create_org(text,text,text,text,text) to authenticated;
