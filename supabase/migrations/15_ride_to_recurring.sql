-- ============================================================================
-- כל נסיעה יכולה להפוך לקבועה, ומתוכה אפשר להירשם לקבוע
--
-- עד עכשיו נסיעה קבועה נולדה רק במקום אחד: טופס נפרד במרחב הנהג, לפני
-- שהייתה נסיעה בכלל. אבל ההחלטה «זה קבוע אצלי» כמעט תמיד מגיעה אחרי —
-- הנהג פרסם, נסע, וראה שזה חוזר. אותו דבר אצל הנוסע: הוא מגלה שהוא רוצה
-- להיות בנסיעה הזו כל שבוע דווקא כשהוא כבר יושב בה.
--
-- לכן שתי הפעולות עוברות לכאן, לנסיעה עצמה:
--   ride_to_template   — הנהג הופך נסיעה קיימת לתבנית קבועה
--   subscribe_to_ride  — הנוסע נרשם קבוע לנסיעה שהוא כבר בה
-- ============================================================================


-- ---------- הנהג: הנסיעה הזו חוזרת ----------
-- יוצרת תבנית מהנסיעה, מקשרת אליה את הנסיעה עצמה, ומשאירה למשימה המתוזמנת
-- לפרסם את ההמשך. אם כבר יש תבנית לנסיעה — לא יוצרים שנייה.
create or replace function ride_to_template(p_ride uuid, p_days int[] default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare r rides; v_days int[]; v_template uuid;
begin
  select * into r from rides where id = p_ride;
  if r.id is null then raise exception 'הנסיעה לא נמצאה'; end if;
  if r.driver_id <> current_member_id() and not is_manager() then
    raise exception 'רק הנהג של הנסיעה יכול להפוך אותה לקבועה';
  end if;
  if r.template_id is not null then
    raise exception 'הנסיעה הזו כבר חלק מנסיעה קבועה';
  end if;

  -- בלי בחירה מפורשת: אותו יום בשבוע כמו הנסיעה עצמה
  v_days := coalesce(p_days, array[extract(dow from r.ride_date)::int]);
  if array_length(v_days, 1) is null then
    raise exception 'צריך לבחור לפחות יום אחד';
  end if;

  insert into ride_templates(org_id, driver_id, days_of_week, depart_time, direction,
                             origin_stop_id, origin_text, dest_text, seats_total,
                             price, auto_approve, active_from)
  values (r.org_id, r.driver_id, v_days, r.depart_time, r.direction,
          r.origin_stop_id, r.origin_text, r.dest_text, r.seats_total,
          r.price, r.auto_approve, r.ride_date)
  returning id into v_template;

  -- הנסיעה שממנה נולדה התבנית הופכת למופע הראשון שלה, כדי שהמשימה
  -- המתוזמנת לא תיצור לאותו יום נסיעה כפולה
  update rides set template_id = v_template where id = p_ride;

  perform log_audit(r.org_id, 'ride', p_ride, 'to_template',
                    jsonb_build_object('template', v_template, 'days', v_days));
  return v_template;
end $$;


-- ---------- הנוסע: תרשום אותי לזה כל פעם ----------
-- נרשם לתבנית של הנסיעה. אם לנסיעה עדיין אין תבנית, אין למה להירשם —
-- ואז מחזירים הודעה שמסבירה בדיוק את זה במקום שגיאה סתומה.
create or replace function subscribe_to_ride(p_ride uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare r rides; v_me uuid := current_member_id(); v_stop uuid; v_sub uuid;
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  select * into r from rides where id = p_ride;
  if r.id is null then raise exception 'הנסיעה לא נמצאה'; end if;
  if r.org_id <> current_org_id() then raise exception 'אין הרשאה לנסיעה הזו'; end if;
  if r.driver_id = v_me then raise exception 'אי אפשר להירשם לנסיעה שאתה הנהג בה'; end if;
  if r.template_id is null then
    raise exception 'הנסיעה הזו אינה חלק מנסיעה קבועה. הנהג צריך להפוך אותה לקבועה קודם.';
  end if;

  -- שומרים את נקודת האיסוף שהנוסע כבר בחר בנסיעה הזו, כדי שלא יצטרך
  -- לבחור אותה שוב בכל נסיעה שתיווצר
  select pickup_stop_id into v_stop from bookings
   where ride_id = p_ride and passenger_id = v_me;

  insert into subscriptions(org_id, template_id, passenger_id, pickup_stop_id, active)
  values (r.org_id, r.template_id, v_me, v_stop, true)
  on conflict (template_id, passenger_id)
    do update set active = true, pickup_stop_id = excluded.pickup_stop_id
  returning id into v_sub;

  perform log_audit(r.org_id, 'subscription', v_sub, 'subscribe',
                    jsonb_build_object('from_ride', p_ride));
  return v_sub;
end $$;


-- ---------- ביטול הרישום הקבוע, מאותו מקום ----------
create or replace function unsubscribe_from_ride(p_ride uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rides; v_me uuid := current_member_id();
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  select * into r from rides where id = p_ride;
  if r.id is null or r.template_id is null then return; end if;

  update subscriptions set active = false
   where template_id = r.template_id and passenger_id = v_me;
end $$;


revoke all on function ride_to_template(uuid,int[])   from public, anon;
revoke all on function subscribe_to_ride(uuid)        from public, anon;
revoke all on function unsubscribe_from_ride(uuid)    from public, anon;
grant execute on function ride_to_template(uuid,int[])  to authenticated;
grant execute on function subscribe_to_ride(uuid)       to authenticated;
grant execute on function unsubscribe_from_ride(uuid)   to authenticated;
