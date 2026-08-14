-- ============================================================================
-- הרשאות גישה (Row Level Security)
--
-- העיקרון: בלי כניסה תקינה — אפס גישה. עם כניסה — רואים רק את הארגון שלך.
-- פרטי קשר (טלפון/מייל) נחשפים רק למי שבאמת נוסע איתך, ולמנהל.
-- ============================================================================

-- ---------- פונקציות עזר ----------
-- SECURITY DEFINER: הפונקציות קוראות את טבלת members בעקיפת ההרשאות,
-- אחרת מדיניות ההרשאות של members הייתה קוראת לעצמה בלולאה אינסופית.

create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members
    where user_id = auth.uid() and status = 'active' and role = 'manager'
  )
$$;

-- האם אני והחבר הזה חולקים נסיעה בפועל (אחד נהג והשני נוסע, או שנינו נוסעים)
create or replace function shares_ride_with(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rides r join bookings b on b.ride_id = r.id
    where r.driver_id = current_member_id() and b.passenger_id = target
      and b.status in ('approved','rode')
    union all
    select 1 from rides r join bookings b on b.ride_id = r.id
    where r.driver_id = target and b.passenger_id = current_member_id()
      and b.status in ('approved','rode')
    union all
    select 1 from bookings b1 join bookings b2 on b1.ride_id = b2.ride_id
    where b1.passenger_id = current_member_id() and b2.passenger_id = target
      and b1.status in ('approved','rode') and b2.status in ('approved','rode')
  )
$$;

-- האם אני הנהג של הנסיעה הזו
create or replace function is_ride_driver(p_ride uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rides where id = p_ride and driver_id = current_member_id())
$$;

-- ---------- הפעלת ההגנה על כל הטבלאות ----------
do $$
declare t text;
begin
  foreach t in array array[
    'orgs','members','member_contacts','vehicles','stops','ride_templates','rides',
    'bookings','subscriptions','trusted_passengers','charges','payments',
    'settlements','notifications','push_subscriptions','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    -- אורח לא מזוהה: אפס גישה, בלי יוצא מן הכלל
    execute format('revoke all on table %I from anon', t);
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
  end loop;
end $$;

-- ---------- ארגון ----------
create policy org_read   on orgs for select to authenticated using (id = current_org_id());
create policy org_update on orgs for update to authenticated
  using (id = current_org_id() and is_manager()) with check (id = current_org_id());

-- ---------- חברים ----------
create policy members_read on members for select to authenticated
  using (org_id = current_org_id());
create policy members_update on members for update to authenticated
  using (id = current_member_id() or (org_id = current_org_id() and is_manager()))
  with check (org_id = current_org_id());
create policy members_delete on members for delete to authenticated
  using (org_id = current_org_id() and is_manager() and id <> current_member_id());
-- הוספת חבר נעשית רק דרך פונקציית ההרשמה בשרת, לא ישירות מהדפדפן.

-- ---------- פרטי קשר ----------
create policy contacts_read on member_contacts for select to authenticated
  using (
    member_id = current_member_id()
    or (org_id = current_org_id() and is_manager())
    or (org_id = current_org_id() and shares_ride_with(member_id))
  );
create policy contacts_write on member_contacts for insert to authenticated
  with check (member_id = current_member_id() or (org_id = current_org_id() and is_manager()));
create policy contacts_update on member_contacts for update to authenticated
  using (member_id = current_member_id() or (org_id = current_org_id() and is_manager()))
  with check (org_id = current_org_id());

-- ---------- רכבים ----------
create policy vehicles_read on vehicles for select to authenticated
  using (org_id = current_org_id());
create policy vehicles_write on vehicles for insert to authenticated
  with check (org_id = current_org_id() and (member_id = current_member_id() or is_manager()));
create policy vehicles_update on vehicles for update to authenticated
  using (org_id = current_org_id() and (member_id = current_member_id() or is_manager()))
  with check (org_id = current_org_id());
create policy vehicles_delete on vehicles for delete to authenticated
  using (org_id = current_org_id() and (member_id = current_member_id() or is_manager()));

-- ---------- נקודות איסוף (ניהול: מנהל בלבד) ----------
create policy stops_read on stops for select to authenticated
  using (org_id = current_org_id());
create policy stops_write on stops for insert to authenticated
  with check (org_id = current_org_id() and is_manager());
create policy stops_update on stops for update to authenticated
  using (org_id = current_org_id() and is_manager()) with check (org_id = current_org_id());
create policy stops_delete on stops for delete to authenticated
  using (org_id = current_org_id() and is_manager());

-- ---------- תבניות נסיעה קבועה ----------
create policy templates_read on ride_templates for select to authenticated
  using (org_id = current_org_id());
create policy templates_write on ride_templates for insert to authenticated
  with check (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()));
create policy templates_update on ride_templates for update to authenticated
  using (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()))
  with check (org_id = current_org_id());
create policy templates_delete on ride_templates for delete to authenticated
  using (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()));

-- ---------- נסיעות ----------
create policy rides_read on rides for select to authenticated
  using (org_id = current_org_id());
create policy rides_write on rides for insert to authenticated
  with check (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()));
create policy rides_update on rides for update to authenticated
  using (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()))
  with check (org_id = current_org_id());
create policy rides_delete on rides for delete to authenticated
  using (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()));

-- ---------- הצטרפויות ----------
-- כל חברי הארגון רואים מי רשום לנסיעה (כדי לדעת עם מי נוסעים).
create policy bookings_read on bookings for select to authenticated
  using (org_id = current_org_id());
-- נרשמים רק בשם עצמך; הנהג/מנהל יכולים להוסיף נוסע ידנית.
create policy bookings_write on bookings for insert to authenticated
  with check (
    org_id = current_org_id()
    and (passenger_id = current_member_id() or is_ride_driver(ride_id) or is_manager())
  );
-- מעדכנים: הנוסע (ביטול), הנהג (אישור/דחייה/נוכחות), או המנהל.
create policy bookings_update on bookings for update to authenticated
  using (
    org_id = current_org_id()
    and (passenger_id = current_member_id() or is_ride_driver(ride_id) or is_manager())
  )
  with check (org_id = current_org_id());
create policy bookings_delete on bookings for delete to authenticated
  using (org_id = current_org_id() and (passenger_id = current_member_id() or is_manager()));

-- ---------- מנוי קבוע ----------
create policy subs_read on subscriptions for select to authenticated
  using (org_id = current_org_id());
create policy subs_write on subscriptions for insert to authenticated
  with check (org_id = current_org_id() and passenger_id = current_member_id());
create policy subs_update on subscriptions for update to authenticated
  using (org_id = current_org_id() and (passenger_id = current_member_id() or is_manager()))
  with check (org_id = current_org_id());
create policy subs_delete on subscriptions for delete to authenticated
  using (org_id = current_org_id() and (passenger_id = current_member_id() or is_manager()));

-- ---------- רשימת אישור אוטומטי ----------
create policy trusted_read on trusted_passengers for select to authenticated
  using (org_id = current_org_id() and (driver_id = current_member_id() or is_manager()));
create policy trusted_write on trusted_passengers for insert to authenticated
  with check (org_id = current_org_id() and driver_id = current_member_id());
create policy trusted_delete on trusted_passengers for delete to authenticated
  using (org_id = current_org_id() and driver_id = current_member_id());

-- ---------- חיובים (כסף — רק הצדדים הנוגעים בדבר) ----------
create policy charges_read on charges for select to authenticated
  using (
    org_id = current_org_id()
    and (payer_id = current_member_id() or payee_id = current_member_id() or is_manager())
  );
create policy charges_write on charges for insert to authenticated
  with check (org_id = current_org_id() and (payee_id = current_member_id() or is_manager()));
create policy charges_update on charges for update to authenticated
  using (org_id = current_org_id() and (payee_id = current_member_id() or is_manager()))
  with check (org_id = current_org_id());
create policy charges_delete on charges for delete to authenticated
  using (org_id = current_org_id() and (payee_id = current_member_id() or is_manager()));

-- ---------- תשלומים ----------
create policy payments_read on payments for select to authenticated
  using (
    org_id = current_org_id()
    and (payer_id = current_member_id() or payee_id = current_member_id() or is_manager())
  );
-- מסמנים תשלום רק בשם עצמך.
create policy payments_write on payments for insert to authenticated
  with check (org_id = current_org_id() and payer_id = current_member_id());
-- מאשר/דוחה רק מי שאמור לקבל את הכסף (או המנהל).
create policy payments_update on payments for update to authenticated
  using (org_id = current_org_id() and (payee_id = current_member_id() or is_manager()))
  with check (org_id = current_org_id());

-- ---------- סגירת חודש ----------
create policy settlements_read on settlements for select to authenticated
  using (
    org_id = current_org_id()
    and (payer_id = current_member_id() or payee_id = current_member_id() or is_manager())
  );
create policy settlements_write on settlements for insert to authenticated
  with check (org_id = current_org_id() and is_manager());
create policy settlements_update on settlements for update to authenticated
  using (org_id = current_org_id() and is_manager()) with check (org_id = current_org_id());

-- ---------- התראות ----------
create policy notif_read on notifications for select to authenticated
  using (member_id = current_member_id());
create policy notif_update on notifications for update to authenticated
  using (member_id = current_member_id()) with check (member_id = current_member_id());

-- ---------- מנויי התראות דחיפה ----------
create policy push_read on push_subscriptions for select to authenticated
  using (member_id = current_member_id());
create policy push_write on push_subscriptions for insert to authenticated
  with check (member_id = current_member_id());
create policy push_delete on push_subscriptions for delete to authenticated
  using (member_id = current_member_id());

-- ---------- תיעוד שינויים (קריאה למנהל בלבד) ----------
create policy audit_read on audit_log for select to authenticated
  using (org_id = current_org_id() and is_manager());
