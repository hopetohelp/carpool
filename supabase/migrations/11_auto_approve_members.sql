-- ============================================================================
-- אישור אוטומטי של מצטרפים חדשים
--
-- ברירת המחדל נשארת אישור ידני: מי שמצטרף ממתין למנהל. זה הגיוני לצוות
-- אמיתי, כי קוד הצוות עלול לעבור הלאה למי שלא אמור להיות בפנים.
--
-- אבל יש מקרים שבהם ההמתנה רק מפריעה — ארגון הדגמה, או צוות קטן שבו כל מי
-- שיש לו את הקוד ממילא מוזמן. להם יש עכשיו מתג בהגדרות הארגון.
--
-- המתג כבוי כברירת מחדל: ארגון שלא נגע בהגדרה מתנהג כמו קודם.
-- ============================================================================

create or replace function join_org(
  p_join_code text, p_name text, p_phone text default null, p_is_driver boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid; v_member uuid; v_first boolean; v_auto boolean;
begin
  if v_uid is null then raise exception 'צריך להיות מחובר כדי להצטרף'; end if;
  if exists (select 1 from members where user_id = v_uid) then
    raise exception 'החשבון הזה כבר משויך לארגון';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'צריך למלא שם תצוגה'; end if;

  select id, coalesce((settings->>'auto_approve_members')::boolean, false)
    into v_org, v_auto
    from orgs where upper(join_code) = upper(trim(p_join_code));

  if v_org is null then
    raise exception 'קוד הארגון לא נמצא. כדאי לבדוק את הקוד מול מי שהזמין אותך.';
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
