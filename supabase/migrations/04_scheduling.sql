-- ============================================================================
-- נסיעות קבועות, משימות מתוזמנות וסגירת חודש
-- ============================================================================

create extension if not exists pg_cron with schema cron;

-- ---------- יצירת נסיעות מתבניות קבועות ----------
-- רץ כל רבע שעה. יוצר את הנסיעות של השבועות הקרובים, ומצרף אוטומטית
-- את מי שיש לו מנוי קבוע על אותה תבנית.
create or replace function job_generate_rides() returns int
language plpgsql security definer set search_path = public as $$
declare t ride_templates; d date; v_ride uuid; v_ahead int; n int := 0; s record; v_free int;
begin
  for t in select * from ride_templates where active loop
    v_ahead := coalesce(org_setting(t.org_id, 'publish_weeks_ahead', 4)::int, 4) * 7;
    for d in select generate_series(current_date, current_date + v_ahead, '1 day')::date loop
      continue when not (extract(dow from d)::int = any(t.days_of_week));
      continue when d < t.active_from;
      continue when t.active_to is not null and d > t.active_to;

      insert into rides(org_id, driver_id, template_id, ride_date, depart_time, departs_at,
                        direction, origin_stop_id, origin_text, dest_text,
                        seats_total, price, auto_approve, status, notes)
      values (t.org_id, t.driver_id, t.id, d, t.depart_time, now(),
              t.direction, t.origin_stop_id, t.origin_text, t.dest_text,
              t.seats_total, t.price, t.auto_approve, 'open', t.notes)
      on conflict (driver_id, ride_date, depart_time, direction) do nothing
      returning id into v_ride;

      if v_ride is not null then
        n := n + 1;
        -- צירוף בעלי מנוי קבוע
        for s in select * from subscriptions where template_id = t.id and active order by created_at loop
          select seats_total - seats_taken into v_free from rides where id = v_ride;
          exit when v_free is null or v_free < s.seats;
          insert into bookings(org_id, ride_id, passenger_id, seats, pickup_stop_id,
                               status, source, decided_at)
          values (t.org_id, v_ride, s.passenger_id, s.seats, s.pickup_stop_id,
                  'approved', 'subscription', now())
          on conflict (ride_id, passenger_id) do nothing;
        end loop;
      end if;
      v_ride := null;
    end loop;
  end loop;
  return n;
end $$;

-- ---------- נעילה וסגירה אוטומטית ----------
-- נועל נסיעה X שעות לפני היציאה, ומעביר להיסטוריה נסיעה שהשעה שלה עברה.
create or replace function job_lock_and_close_rides() returns int
language plpgsql security definer set search_path = public as $$
declare r rides; n int := 0; v_lock numeric;
begin
  for r in select * from rides where status in ('open','full') loop
    v_lock := org_setting(r.org_id, 'lock_ride_hours_before', 2);
    if r.departs_at - (v_lock || ' hours')::interval <= now() then
      update rides set status = 'locked' where id = r.id;
    end if;
  end loop;

  -- שלוש שעות אחרי שעת היציאה — הנסיעה נחשבת שהתבצעה ונכנסת להיסטוריה
  for r in select * from rides
           where status in ('open','full','locked','departed')
             and departs_at + interval '3 hours' < now() loop
    if exists (select 1 from bookings where ride_id = r.id and status = 'approved') then
      perform close_ride_internal(r.id, null);
    else
      update rides set status = 'closed' where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- אישור אוטומטי של תשלום שהנהג לא טיפל בו ----------
create or replace function job_auto_confirm_payments() returns int
language plpgsql security definer set search_path = public as $$
declare p payments; n int := 0; v_days numeric;
begin
  for p in select * from payments where status = 'marked' loop
    v_days := org_setting(p.org_id, 'auto_confirm_days', 7);
    if v_days > 0 and p.marked_at + (v_days || ' days')::interval < now() then
      update payments set status = 'confirmed', confirmed_at = now(), auto_confirmed = true
        where id = p.id;
      perform notify_member(p.payer_id, 'payment_confirmed', 'התשלום אושר אוטומטית',
        'עברו ' || v_days || ' ימים בלי תגובה מהנהג, ולכן התשלום על סך ' || p.amount ||
        ' ₪ אושר אוטומטית.', '/money');
      perform notify_member(p.payee_id, 'payment_auto_confirmed', 'תשלום אושר אוטומטית',
        'לא אישרת תוך ' || v_days || ' ימים תשלום על סך ' || p.amount ||
        ' ₪, ולכן הוא אושר אוטומטית. אם זו טעות — פנה למנהל.', '/money');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------- תזכורות יומיות ----------
create or replace function job_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r rides; b bookings; n int := 0; v_due numeric; bal record;
begin
  -- תזכורת נסיעה מחר
  for r in select * from rides
           where status in ('open','full','locked')
             and departs_at between now() + interval '12 hours' and now() + interval '36 hours' loop
    for b in select * from bookings where ride_id = r.id and status = 'approved' loop
      perform notify_member(b.passenger_id, 'ride_tomorrow', 'תזכורת: נסיעה מחר',
        'נסיעה עם ' || (select name from members where id = r.driver_id) || ' בשעה ' ||
        to_char(r.depart_time, 'HH24:MI') || '.', '/ride/' || r.id);
      n := n + 1;
    end loop;
    if r.seats_taken > 0 then
      perform notify_member(r.driver_id, 'ride_tomorrow_driver', 'תזכורת: אתה נוהג מחר',
        r.seats_taken || ' נוסעים רשומים לנסיעה בשעה ' ||
        to_char(r.depart_time, 'HH24:MI') || '.', '/ride/' || r.id);
    end if;
  end loop;

  -- תזכורת חוב פתוח (פעם בשבוע, בימי ראשון)
  if extract(dow from now() at time zone 'Asia/Jerusalem')::int = 0 then
    for bal in select * from balances where owed - pending > 0 loop
      select org_setting(bal.org_id, 'payment_due_days', 14) into v_due;
      perform notify_member(bal.payer_id, 'debt_reminder', 'יש לך חוב פתוח',
        'נותרו ' || round(bal.owed - bal.pending, 2) || ' ₪ לתשלום ל' ||
        (select name from members where id = bal.payee_id) || '.', '/money');
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;

-- ---------- סגירת חודש ----------
-- מרכזת את כל החובות הפתוחים בתקופה לדף חשבון אחד לכל זוג.
create or replace function close_month(p_start date, p_end date) returns int
language plpgsql security definer set search_path = public as $$
declare v_org uuid := current_org_id(); rec record; n int := 0;
begin
  if not is_manager() then raise exception 'רק מנהל יכול לסגור חודש'; end if;
  if p_end < p_start then raise exception 'טווח תאריכים לא תקין'; end if;

  for rec in
    select c.payer_id, c.payee_id, sum(c.amount) as amount, count(*)::int as rides_count
    from charges c
    where c.org_id = v_org and c.created_at::date between p_start and p_end
    group by c.payer_id, c.payee_id
    having sum(c.amount) > 0
  loop
    insert into settlements(org_id, period_start, period_end, payer_id, payee_id, amount, rides_count, status)
    values (v_org, p_start, p_end, rec.payer_id, rec.payee_id, rec.amount, rec.rides_count, 'sent')
    on conflict (org_id, period_start, payer_id, payee_id)
      do update set amount = excluded.amount, rides_count = excluded.rides_count,
                    period_end = excluded.period_end;

    perform notify_member(rec.payer_id, 'settlement', 'דף חשבון חודשי',
      'סיכום ' || to_char(p_start,'MM/YYYY') || ': ' || rec.rides_count || ' נסיעות, סה"כ ' ||
      rec.amount || ' ₪ ל' || (select name from members where id = rec.payee_id) || '.', '/money');
    n := n + 1;
  end loop;

  perform log_audit(v_org, 'settlement', null, 'close_month',
    jsonb_build_object('start', p_start, 'end', p_end, 'count', n));
  return n;
end $$;

-- ---------- לוח זמנים ----------
-- הסרה לפני הוספה, כדי שהרצה חוזרת של המיגרציה לא תיצור משימות כפולות.
select cron.unschedule(jobid) from cron.job
 where jobname in ('generate-rides','lock-close-rides','auto-confirm-pay','daily-reminders');

select cron.schedule('generate-rides',    '*/15 * * * *', $$select job_generate_rides()$$);
select cron.schedule('lock-close-rides',  '*/15 * * * *', $$select job_lock_and_close_rides()$$);
select cron.schedule('auto-confirm-pay',  '17 3 * * *',   $$select job_auto_confirm_payments()$$);
-- 15:00 UTC = 18:00 בישראל בשעון קיץ — תזכורת ערב לנסיעה של מחר
select cron.schedule('daily-reminders',   '0 15 * * *',   $$select job_reminders()$$);
