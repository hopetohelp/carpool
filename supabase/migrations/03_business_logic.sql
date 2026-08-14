-- ============================================================================
-- לוגיקה עסקית: טריגרים, פונקציות פעולה, ותצוגת יתרות
--
-- כל הפעולות שמשנות סטטוס עוברות דרך פונקציות ולא דרך עדכון ישיר מהדפדפן,
-- כדי שהכללים (מקומות פנויים, מדיניות ביטול, יצירת חיובים, התראות, תיעוד)
-- ייאכפו במקום אחד ולא ייעקפו.
-- ============================================================================

-- ---------- עזרי מערכת ----------

create or replace function notify_member(
  p_member uuid, p_kind text, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from members where id = p_member;
  if v_org is null then return; end if;
  insert into notifications(org_id, member_id, kind, title, body, link, data)
  values (v_org, p_member, p_kind, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb));
end $$;

create or replace function log_audit(
  p_org uuid, p_entity text, p_entity_id uuid, p_action text, p_detail jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(org_id, actor_id, entity, entity_id, action, detail)
  values (p_org, current_member_id(), p_entity, p_entity_id, p_action, p_detail);
end $$;

create or replace function org_setting(p_org uuid, p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((settings->>p_key)::numeric, p_default) from orgs where id = p_org
$$;

-- ---------- טריגרים ----------

-- שעת יציאה מוחלטת, מחושבת מאזור הזמן של הארגון
create or replace function rides_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare tz text;
begin
  select coalesce(settings->>'timezone','Asia/Jerusalem') into tz from orgs where id = new.org_id;
  new.departs_at := (new.ride_date + new.depart_time) at time zone tz;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rides_before_write_trg on rides;
create trigger rides_before_write_trg before insert or update on rides
for each row execute function rides_before_write();

-- ספירת מקומות תפוסים + מעבר אוטומטי בין "פתוחה" ל"מלאה"
create or replace function bookings_sync_seats() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ride uuid; v_taken int; v_total int; v_status ride_status;
begin
  v_ride := coalesce(new.ride_id, old.ride_id);
  select coalesce(sum(seats),0) into v_taken
    from bookings where ride_id = v_ride and status in ('approved','rode');
  select seats_total, status into v_total, v_status from rides where id = v_ride;
  if v_total is null then return null; end if;
  update rides set seats_taken = v_taken,
    status = case
      when v_status in ('cancelled','closed','finished','departed','locked') then v_status
      when v_taken >= v_total then 'full'::ride_status
      else 'open'::ride_status
    end
  where id = v_ride;
  return null;
end $$;

drop trigger if exists bookings_seats_trg on bookings;
create trigger bookings_seats_trg after insert or update or delete on bookings
for each row execute function bookings_sync_seats();

-- ---------- תצוגת יתרות ----------
-- כמה חויב, כמה שולם ואושר, כמה ממתין לאישור, וכמה נשאר לשלם בפועל.
create or replace view balances with (security_invoker = true) as
select org_id, payer_id, payee_id,
       sum(charged)   as charged,
       sum(confirmed) as paid,
       sum(pending)   as pending,
       sum(charged) - sum(confirmed) as owed
from (
  select org_id, payer_id, payee_id, amount as charged, 0::numeric as confirmed, 0::numeric as pending
    from charges
  union all
  select org_id, payer_id, payee_id, 0, amount, 0 from payments where status = 'confirmed'
  union all
  select org_id, payer_id, payee_id, 0, 0, amount from payments where status = 'marked'
) t
group by org_id, payer_id, payee_id;

grant select on balances to authenticated;

-- ---------- קידום רשימת המתנה ----------
create or replace function promote_waitlist(p_ride uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rides; b bookings; v_free int;
begin
  select * into r from rides where id = p_ride;
  if r is null or r.status in ('cancelled','closed','finished') then return; end if;
  loop
    select seats_total - seats_taken into v_free from rides where id = p_ride;
    exit when v_free is null or v_free <= 0;
    select * into b from bookings
      where ride_id = p_ride and status = 'waitlisted' and seats <= v_free
      order by created_at limit 1;
    exit when b is null;
    update bookings set status = 'approved', decided_at = now() where id = b.id;
    perform notify_member(b.passenger_id, 'waitlist_promoted', 'התפנה לך מקום בנסיעה',
      'היית ברשימת המתנה והמקום התפנה — אתה רשום לנסיעה.', '/ride/' || p_ride);
  end loop;
end $$;

-- ---------- בקשת הצטרפות ----------
create or replace function request_booking(
  p_ride uuid, p_seats int default 1, p_stop uuid default null, p_note text default null
) returns bookings language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); r rides; v_auto boolean;
        v_status booking_status; b bookings; v_free int; v_name text;
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  select * into r from rides where id = p_ride;
  if r is null then raise exception 'הנסיעה לא נמצאה'; end if;
  if r.org_id <> current_org_id() then raise exception 'אין הרשאה לנסיעה הזו'; end if;
  if r.driver_id = v_me then raise exception 'אי אפשר להצטרף לנסיעה שאתה הנהג בה'; end if;
  if r.status in ('cancelled','closed','finished','departed','locked') then
    raise exception 'הנסיעה כבר סגורה להצטרפות';
  end if;

  select name into v_name from members where id = v_me;
  v_auto := r.auto_approve
    or exists (select 1 from trusted_passengers
               where driver_id = r.driver_id and passenger_id = v_me);
  v_free := r.seats_total - r.seats_taken;

  v_status := case
    when v_free < p_seats then 'waitlisted'::booking_status
    when v_auto           then 'approved'::booking_status
    else                       'requested'::booking_status
  end;

  insert into bookings(org_id, ride_id, passenger_id, seats, pickup_stop_id, status, note, decided_at)
  values (r.org_id, p_ride, v_me, p_seats, p_stop, v_status, p_note,
          case when v_status = 'approved' then now() end)
  on conflict (ride_id, passenger_id) do update
    set status = excluded.status, seats = excluded.seats,
        pickup_stop_id = excluded.pickup_stop_id, note = excluded.note,
        decided_at = excluded.decided_at
  returning * into b;

  if v_status = 'approved' then
    perform notify_member(v_me, 'booking_approved', 'ההצטרפות אושרה',
      'אתה רשום לנסיעה. נתראה בזמן.', '/ride/' || p_ride);
    perform notify_member(r.driver_id, 'booking_new', 'נוסע חדש בנסיעה',
      v_name || ' הצטרף/ה לנסיעה שלך.', '/ride/' || p_ride);
  elsif v_status = 'waitlisted' then
    perform notify_member(r.driver_id, 'booking_waitlist', 'ממתין ברשימת המתנה',
      v_name || ' ממתין/ה למקום שיתפנה בנסיעה שלך.', '/ride/' || p_ride);
  else
    perform notify_member(r.driver_id, 'booking_request', 'בקשת הצטרפות חדשה',
      v_name || ' מבקש/ת להצטרף לנסיעה שלך.', '/ride/' || p_ride);
  end if;

  perform log_audit(r.org_id, 'booking', b.id, 'request', jsonb_build_object('status', v_status));
  return b;
end $$;

-- ---------- אישור או דחייה של בקשה ----------
create or replace function decide_booking(
  p_booking uuid, p_approve boolean, p_reason text default null
) returns bookings language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); b bookings; r rides; v_free int;
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  select * into b from bookings where id = p_booking;
  if b is null then raise exception 'הבקשה לא נמצאה'; end if;
  select * into r from rides where id = b.ride_id;
  if r.driver_id <> v_me and not is_manager() then
    raise exception 'רק הנהג של הנסיעה יכול לאשר או לדחות';
  end if;
  if b.status not in ('requested','waitlisted') then
    raise exception 'הבקשה כבר טופלה';
  end if;

  if p_approve then
    v_free := r.seats_total - r.seats_taken;
    if v_free < b.seats then raise exception 'אין מספיק מקומות פנויים'; end if;
    update bookings set status = 'approved', decided_at = now() where id = p_booking returning * into b;
    perform notify_member(b.passenger_id, 'booking_approved', 'ההצטרפות אושרה',
      'הנהג אישר את ההצטרפות שלך לנסיעה.', '/ride/' || r.id);
  else
    update bookings set status = 'rejected', decided_at = now(), note = coalesce(p_reason, note)
      where id = p_booking returning * into b;
    perform notify_member(b.passenger_id, 'booking_rejected', 'הבקשה נדחתה',
      coalesce(p_reason, 'הנהג לא יכול לקחת אותך בנסיעה הזו.'), '/ride/' || r.id);
    perform promote_waitlist(r.id);
  end if;

  perform log_audit(r.org_id, 'booking', b.id,
    case when p_approve then 'approve' else 'reject' end,
    jsonb_build_object('reason', p_reason));
  return b;
end $$;

-- ---------- ביטול הצטרפות (עם מדיניות ביטול) ----------
create or replace function cancel_booking(p_booking uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); b bookings; r rides;
        v_deadline numeric; v_pct numeric; v_amount numeric; v_late boolean;
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  select * into b from bookings where id = p_booking;
  if b is null then raise exception 'ההרשמה לא נמצאה'; end if;
  if b.passenger_id <> v_me and not is_manager() then
    raise exception 'אפשר לבטל רק הרשמה של עצמך';
  end if;
  if b.status in ('cancelled','rode','no_show') then raise exception 'ההרשמה כבר סגורה'; end if;

  select * into r from rides where id = b.ride_id;
  v_deadline := org_setting(r.org_id, 'cancel_deadline_hours', 3);
  v_pct      := org_setting(r.org_id, 'cancel_charge_pct', 100);
  v_late     := b.status = 'approved'
                and r.departs_at - (v_deadline || ' hours')::interval < now()
                and r.status not in ('cancelled');

  update bookings set status = 'cancelled', decided_at = now() where id = p_booking returning * into b;

  -- ביטול מאוחר: הנוסע עדיין מחויב לפי המדיניות שהמנהל קבע
  if v_late and v_pct > 0 and r.price > 0 then
    v_amount := round(r.price * b.seats * v_pct / 100.0, 2);
    insert into charges(org_id, ride_id, booking_id, payer_id, payee_id, amount, kind, note)
    values (r.org_id, r.id, b.id, b.passenger_id, r.driver_id, v_amount, 'cancellation',
            'ביטול מאוחר — פחות מ-' || v_deadline || ' שעות לפני הנסיעה')
    on conflict (booking_id) do nothing;
    perform notify_member(b.passenger_id, 'late_cancel', 'ביטול מאוחר — חיוב נשאר',
      'ביטלת פחות מ-' || v_deadline || ' שעות לפני הנסיעה, ולכן החיוב על סך ' ||
      v_amount || ' ₪ נשאר בתוקף לפי מדיניות הארגון.', '/money');
  end if;

  perform notify_member(r.driver_id, 'booking_cancelled', 'ביטול הצטרפות',
    (select name from members where id = b.passenger_id) || ' ביטל/ה את ההצטרפות לנסיעה.',
    '/ride/' || r.id);
  perform promote_waitlist(r.id);
  perform log_audit(r.org_id, 'booking', b.id, 'cancel', jsonb_build_object('late', v_late));
  return b;
end $$;

-- ---------- סגירת נסיעה ויצירת חיובים ----------
-- p_attended: רשימת מזהי הנוסעים שבאמת נסעו. NULL = כולם שאושרו נסעו.
create or replace function close_ride_internal(p_ride uuid, p_attended uuid[] default null)
returns rides language plpgsql security definer set search_path = public as $$
declare r rides; b bookings; v_amount numeric;
begin
  select * into r from rides where id = p_ride;
  if r is null then raise exception 'הנסיעה לא נמצאה'; end if;
  if r.status = 'closed' then return r; end if;
  if r.status = 'cancelled' then raise exception 'הנסיעה בוטלה'; end if;

  for b in select * from bookings where ride_id = p_ride and status in ('approved','rode') loop
    if p_attended is not null and not (b.passenger_id = any(p_attended)) then
      update bookings set status = 'no_show' where id = b.id;
      delete from charges where booking_id = b.id;
    else
      update bookings set status = 'rode' where id = b.id;
      if r.price > 0 then
        v_amount := round(r.price * b.seats, 2);
        insert into charges(org_id, ride_id, booking_id, payer_id, payee_id, amount, kind, note)
        values (r.org_id, r.id, b.id, b.passenger_id, r.driver_id, v_amount, 'ride', null)
        on conflict (booking_id) do update set amount = excluded.amount;
        perform notify_member(b.passenger_id, 'charge_created', 'נוסף חיוב על נסיעה',
          'נסיעה עם ' || (select name from members where id = r.driver_id) ||
          ' — ' || v_amount || ' ₪.', '/money');
      end if;
    end if;
  end loop;

  update rides set status = 'closed' where id = p_ride returning * into r;
  perform log_audit(r.org_id, 'ride', r.id, 'close', jsonb_build_object('attended', p_attended));
  return r;
end $$;

create or replace function close_ride(p_ride uuid, p_attended uuid[] default null)
returns rides language plpgsql security definer set search_path = public as $$
declare r rides;
begin
  select * into r from rides where id = p_ride;
  if r is null then raise exception 'הנסיעה לא נמצאה'; end if;
  if r.driver_id <> current_member_id() and not is_manager() then
    raise exception 'רק הנהג של הנסיעה יכול לסגור אותה';
  end if;
  return close_ride_internal(p_ride, p_attended);
end $$;

-- ---------- ביטול נסיעה שלמה ----------
create or replace function cancel_ride(p_ride uuid, p_reason text default null) returns rides
language plpgsql security definer set search_path = public as $$
declare r rides; b bookings;
begin
  select * into r from rides where id = p_ride;
  if r is null then raise exception 'הנסיעה לא נמצאה'; end if;
  if r.driver_id <> current_member_id() and not is_manager() then
    raise exception 'רק הנהג של הנסיעה יכול לבטל אותה';
  end if;
  if r.status = 'closed' then raise exception 'הנסיעה כבר נסגרה ואי אפשר לבטל אותה'; end if;

  for b in select * from bookings where ride_id = p_ride and status in ('approved','requested','waitlisted') loop
    update bookings set status = 'cancelled', decided_at = now() where id = b.id;
    perform notify_member(b.passenger_id, 'ride_cancelled', 'הנסיעה בוטלה',
      coalesce(p_reason, 'הנהג ביטל את הנסיעה.') || ' כדאי לחפש נסיעה חלופית.', '/board');
  end loop;

  update rides set status = 'cancelled', notes = coalesce(p_reason, notes)
    where id = p_ride returning * into r;
  perform log_audit(r.org_id, 'ride', r.id, 'cancel', jsonb_build_object('reason', p_reason));
  return r;
end $$;

-- ---------- הוספת נסיעה ידנית (נסעתי בלי להירשם מראש) ----------
create or replace function log_manual_ride(
  p_driver uuid, p_date date, p_price numeric,
  p_direction ride_direction default 'to_work', p_time time default '07:30'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); v_org uuid := current_org_id();
        r rides; b bookings;
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  if p_driver = v_me then raise exception 'אי אפשר לרשום נסיעה של עצמך כנוסע'; end if;
  if not exists (select 1 from members where id = p_driver and org_id = v_org) then
    raise exception 'הנהג לא נמצא בארגון';
  end if;
  if p_price < 0 then raise exception 'מחיר לא יכול להיות שלילי'; end if;

  select * into r from rides
    where driver_id = p_driver and ride_date = p_date and direction = p_direction limit 1;

  if r is null then
    insert into rides(org_id, driver_id, ride_date, depart_time, departs_at, direction,
                      seats_total, price, status, notes)
    values (v_org, p_driver, p_date, p_time, now(), p_direction, 4, p_price, 'closed',
            'נרשמה ידנית בדיעבד')
    returning * into r;
  end if;

  insert into bookings(org_id, ride_id, passenger_id, seats, status, source, decided_at)
  values (v_org, r.id, v_me, 1, 'rode', 'manual', now())
  on conflict (ride_id, passenger_id) do update set status = 'rode', source = 'manual'
  returning * into b;

  if p_price > 0 then
    insert into charges(org_id, ride_id, booking_id, payer_id, payee_id, amount, kind, note)
    values (v_org, r.id, b.id, v_me, p_driver, p_price, 'manual', 'נסיעה שנרשמה ידנית')
    on conflict (booking_id) do update set amount = excluded.amount;
  end if;

  perform notify_member(p_driver, 'manual_ride', 'נרשמה נסיעה ידנית',
    (select name from members where id = v_me) || ' רשם/ה נסיעה איתך בתאריך ' ||
    to_char(p_date,'DD/MM') || ' על סך ' || p_price || ' ₪. אם זו טעות — אפשר לפנות אליו/ה.', '/money');
  perform log_audit(v_org, 'ride', r.id, 'manual_log', jsonb_build_object('price', p_price));
  return r.id;
end $$;

-- ---------- תשלומים ----------
create or replace function mark_payment(
  p_payee uuid, p_amount numeric, p_method payment_method default 'bit',
  p_reference text default null, p_note text default null, p_proof_url text default null
) returns payments language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); v_org uuid := current_org_id(); p payments;
begin
  if v_me is null then raise exception 'לא מחובר'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'סכום התשלום חייב להיות חיובי'; end if;
  if not exists (select 1 from members where id = p_payee and org_id = v_org) then
    raise exception 'המקבל לא נמצא בארגון';
  end if;

  insert into payments(org_id, payer_id, payee_id, amount, method, reference, note, proof_url, status)
  values (v_org, v_me, p_payee, p_amount, p_method, p_reference, p_note, p_proof_url, 'marked')
  returning * into p;

  perform notify_member(p_payee, 'payment_marked', 'תשלום ממתין לאישורך',
    (select name from members where id = v_me) || ' סימן/ה תשלום על סך ' || p_amount ||
    ' ₪. צריך לאשר שקיבלת.', '/money');
  perform log_audit(v_org, 'payment', p.id, 'mark', jsonb_build_object('amount', p_amount));
  return p;
end $$;

create or replace function confirm_payment(p_payment uuid) returns payments
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); p payments;
begin
  select * into p from payments where id = p_payment;
  if p is null then raise exception 'התשלום לא נמצא'; end if;
  if p.payee_id <> v_me and not is_manager() then
    raise exception 'רק מי שאמור לקבל את הכסף יכול לאשר';
  end if;
  if p.status = 'confirmed' then return p; end if;

  update payments set status = 'confirmed', confirmed_at = now(), confirmed_by = v_me
    where id = p_payment returning * into p;
  perform notify_member(p.payer_id, 'payment_confirmed', 'התשלום אושר',
    (select name from members where id = p.payee_id) || ' אישר/ה קבלת ' || p.amount || ' ₪.', '/money');
  perform log_audit(p.org_id, 'payment', p.id, 'confirm', null);
  return p;
end $$;

create or replace function dispute_payment(p_payment uuid, p_reason text) returns payments
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id(); p payments;
begin
  select * into p from payments where id = p_payment;
  if p is null then raise exception 'התשלום לא נמצא'; end if;
  if p.payee_id <> v_me and not is_manager() then
    raise exception 'רק מי שאמור לקבל את הכסף יכול לסמן מחלוקת';
  end if;

  update payments set status = 'disputed', dispute_reason = p_reason
    where id = p_payment returning * into p;
  perform notify_member(p.payer_id, 'payment_disputed', 'סימון התשלום נדחה',
    (select name from members where id = p.payee_id) || ' סימן/ה שהתשלום לא התקבל: ' ||
    coalesce(p_reason, 'ללא סיבה') || '. כדאי לבדוק מול הנהג.', '/money');
  perform log_audit(p.org_id, 'payment', p.id, 'dispute', jsonb_build_object('reason', p_reason));
  return p;
end $$;
