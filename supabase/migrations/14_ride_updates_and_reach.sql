-- ============================================================================
-- נסיעה שמשתנה, ונסיעה שמישהו יודע עליה
--
-- שני חורים שנמצאו בבדיקת מסלול הנהג:
--
-- 1. אפשר היה לערוך נסיעה במסד (ההרשאה קיימת, הטריגר מחשב מחדש את שעת
--    היציאה) — אבל שינוי כזה היה קורה בשקט מוחלט. נוסע שנרשם ל‑07:30 היה
--    מגלה בעצמו שהשעה זזה. לכן העריכה נחסמה בפועל בממשק, והדרך היחידה
--    לשנות משהו הייתה לבטל את הנסיעה כולה — פעולה הרסנית לשינוי של חמש דקות.
--
-- 2. פרסום נסיעה לא הודיע לאיש. נהג פרסם בערב נסיעה למחר, ואיש לא ידע אלא
--    אם פתח את הכלי במקרה. התזכורת היומית לא סוגרת את זה — היא נשלחת רק
--    למי שכבר רשום.
--
-- הכלל שמנחה את הקובץ: מודיעים רק כשאדם עשה פעולה, ולא כשמכונה עשתה אותה.
-- המשימה המתוזמנת מייצרת עשרות נסיעות בבת אחת ונועלת נסיעות שעברו — התראה
-- על כל אחת מהן הייתה הופכת את פעמון ההתראות לרעש שאיש לא קורא.
-- ============================================================================


-- ---------- 1. עדכון נסיעה: מי שנרשם חייב לדעת ----------
-- מודיעים רק על מה שמשנה לנוסע: מתי, מאיפה, לאן, וכמה. שינוי סטטוס
-- (נעילה, סגירה) אינו שינוי של הנהג ולא נכנס לכאן.
-- security invoker (ברירת המחדל) ולא definer: guard_active נשען על current_user
-- כדי לדעת אם אדם ביצע את הפעולה או המערכת. פונקציה שרצה בזכויות הבעלים
-- הייתה תמיד נראית כמו המערכת, וההתראות לא היו נשלחות לעולם.
create or replace function rides_notify_update() returns trigger
language plpgsql set search_path = public as $$
declare b record; v_changes text[] := '{}'; v_text text; v_driver text;
begin
  -- guard_active נכון רק כשהפעולה הגיעה מהדפדפן. משימה מתוזמנת שנועלת
  -- נסיעות רצה בזכויות המערכת ולא אמורה להתריע על כלום.
  if not guard_active() then return new; end if;

  if new.depart_time is distinct from old.depart_time then
    v_changes := v_changes || ('השעה השתנתה ל' || to_char(new.depart_time, 'HH24:MI'));
  end if;
  if new.ride_date is distinct from old.ride_date then
    v_changes := v_changes || ('התאריך השתנה ל' || to_char(new.ride_date, 'DD/MM'));
  end if;
  if new.origin_stop_id is distinct from old.origin_stop_id
     or new.origin_text is distinct from old.origin_text then
    v_changes := v_changes || 'נקודת היציאה השתנתה';
  end if;
  if new.dest_text is distinct from old.dest_text then
    v_changes := v_changes || 'היעד השתנה';
  end if;
  if new.price is distinct from old.price then
    v_changes := v_changes || ('המחיר השתנה ל' || round(new.price) || ' ₪');
  end if;
  if new.seats_total is distinct from old.seats_total then
    v_changes := v_changes || ('מספר המקומות השתנה ל' || new.seats_total);
  end if;

  if array_length(v_changes, 1) is null then return new; end if;

  select name into v_driver from members where id = new.driver_id;
  v_text := array_to_string(v_changes, '. ') || '.';

  -- כל מי שקשור לנסיעה ועדיין רלוונטי: מאושרים, ממתינים לאישור, ורשימת המתנה
  for b in select * from bookings
            where ride_id = new.id
              and status in ('approved','requested','waitlisted') loop
    perform notify_member(b.passenger_id, 'ride_updated', 'שינוי בנסיעה',
      v_driver || ' עדכן/ה את הנסיעה: ' || v_text, '/ride/' || new.id);
  end loop;

  perform log_audit(new.org_id, 'ride', new.id, 'update',
                    jsonb_build_object('changes', v_changes));
  return new;
end $$;

drop trigger if exists rides_notify_update_trg on rides;
create trigger rides_notify_update_trg after update on rides
for each row execute function rides_notify_update();


-- ---------- 2. נסיעה חדשה: שיהיה למי להצטרף ----------
-- נשלח לכל חבר פעיל בארגון חוץ מהנהג עצמו. רק על נסיעה שאדם פרסם ידנית:
-- נסיעות שהמשימה המתוזמנת מייצרת מתבנית מגיעות בעשרות, והתראה על כל אחת
-- מהן הייתה הופכת את הפעמון לרעש. במקומן מודיעים פעם אחת על התבנית עצמה.
-- security invoker (ברירת המחדל) ולא definer: guard_active נשען על current_user
-- כדי לדעת אם אדם ביצע את הפעולה או המערכת. פונקציה שרצה בזכויות הבעלים
-- הייתה תמיד נראית כמו המערכת, וההתראות לא היו נשלחות לעולם.
create or replace function rides_notify_new() returns trigger
language plpgsql set search_path = public as $$
declare m record; v_driver text; v_when text;
begin
  if not guard_active() then return new; end if;
  if new.status = 'cancelled' then return new; end if;

  select name into v_driver from members where id = new.driver_id;
  v_when := to_char(new.ride_date, 'DD/MM') || ' בשעה ' || to_char(new.depart_time, 'HH24:MI');

  for m in select id from members
            where org_id = new.org_id and status = 'active' and id <> new.driver_id loop
    perform notify_member(m.id, 'ride_published', 'נסיעה חדשה בלוח',
      v_driver || ' נוסע/ת ב' || v_when ||
      case when new.direction = 'to_work' then ' לעבודה' else ' מהעבודה' end ||
      '. ' || new.seats_total || ' מקומות.', '/ride/' || new.id);
  end loop;
  return new;
end $$;

drop trigger if exists rides_notify_new_trg on rides;
create trigger rides_notify_new_trg after insert on rides
for each row execute function rides_notify_new();


-- ---------- 3. נסיעה קבועה חדשה: התראה אחת במקום עשרים ----------
-- security invoker (ברירת המחדל) ולא definer: guard_active נשען על current_user
-- כדי לדעת אם אדם ביצע את הפעולה או המערכת. פונקציה שרצה בזכויות הבעלים
-- הייתה תמיד נראית כמו המערכת, וההתראות לא היו נשלחות לעולם.
create or replace function templates_notify_new() returns trigger
language plpgsql set search_path = public as $$
declare m record; v_driver text; v_days text;
begin
  if not guard_active() then return new; end if;
  if not new.active then return new; end if;

  select name into v_driver from members where id = new.driver_id;

  select string_agg(d, ', ' order by ord) into v_days
    from (
      select (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[x + 1] as d,
             x as ord
        from unnest(new.days_of_week) as x
    ) _;

  for m in select id from members
            where org_id = new.org_id and status = 'active' and id <> new.driver_id loop
    perform notify_member(m.id, 'ride_recurring_new', 'נסיעה קבועה חדשה',
      v_driver || ' נוסע/ת בקביעות בימים ' || v_days || ' בשעה ' ||
      to_char(new.depart_time, 'HH24:MI') || '. אפשר להצטרף פעם אחת ולהיות רשום לכולן.',
      '/mine');
  end loop;
  return new;
end $$;

drop trigger if exists templates_notify_new_trg on ride_templates;
create trigger templates_notify_new_trg after insert on ride_templates
for each row execute function templates_notify_new();


-- ---------- 4. עדכון נסיעה קבועה ----------
-- שינוי תבנית לא נוגע בנסיעות שכבר פורסמו ממנה, וזה משאיר שבוע מעורבב של
-- שתי שעות. הפונקציה מיישרת אותן: הנסיעות העתידיות שטרם התחילו מתעדכנות
-- יחד עם התבנית, והנוסעים הרשומים אליהן מקבלים התראה דרך הטריגר שלמעלה.
create or replace function update_template(
  p_template   uuid,
  p_days       int[]   default null,
  p_time       time    default null,
  p_seats      int     default null,
  p_price      numeric default null,
  p_stop       uuid    default null,
  p_dest       text    default null,
  p_auto       boolean default null,
  p_apply_future boolean default true
) returns int
language plpgsql security definer set search_path = public as $$
declare t ride_templates; v_updated int := 0; v_b record;
begin
  select * into t from ride_templates where id = p_template;
  if t.id is null then raise exception 'הנסיעה הקבועה לא נמצאה'; end if;
  if t.driver_id <> current_member_id() and not is_manager() then
    raise exception 'רק הנהג של הנסיעה הקבועה יכול לשנות אותה';
  end if;

  update ride_templates
     set days_of_week   = coalesce(p_days,  days_of_week),
         depart_time    = coalesce(p_time,  depart_time),
         seats_total    = coalesce(p_seats, seats_total),
         price          = coalesce(p_price, price),
         origin_stop_id = case when p_stop is null then origin_stop_id else p_stop end,
         dest_text      = coalesce(p_dest,  dest_text),
         auto_approve   = coalesce(p_auto,  auto_approve)
   where id = p_template
  returning * into t;

  if not p_apply_future then return 0; end if;

  -- רק נסיעות עתידיות שעדיין פתוחות. מה שכבר יצא או נסגר נשאר כפי שהיה.
  update rides r
     set depart_time    = t.depart_time,
         seats_total    = greatest(t.seats_total, r.seats_taken),
         price          = t.price,
         origin_stop_id = t.origin_stop_id,
         dest_text      = t.dest_text,
         auto_approve   = t.auto_approve
   where r.template_id = p_template
     and r.departs_at > now()
     and r.status in ('open','full')
     and extract(dow from r.ride_date)::int = any (t.days_of_week);
  get diagnostics v_updated = row_count;

  -- נסיעות עתידיות שכבר לא נופלות על יום פעיל בתבנית — מבוטלות, כי אחרת
  -- הן נשארות בלוח בלי שאיש יודע שהן כבר לא חלק מהנסיעה הקבועה
  update rides r
     set status = 'cancelled'
   where r.template_id = p_template
     and r.departs_at > now()
     and r.status in ('open','full')
     and not (extract(dow from r.ride_date)::int = any (t.days_of_week));

  -- הטריגר שמודיע על שינוי נסיעה מתעורר רק לפעולה שהגיעה מהדפדפן, והעדכון
  -- כאן רץ בזכויות המערכת. לכן מודיעים כאן במפורש — אחרת נוסע היה מגלה
  -- בעצמו ששעת הנסיעה שהוא רשום אליה זזה.
  for v_b in
    select distinct b.passenger_id, r.id as ride_id
      from rides r join bookings b on b.ride_id = r.id
     where r.template_id = p_template
       and r.departs_at > now()
       and b.status in ('approved','requested','waitlisted')
  loop
    perform notify_member(v_b.passenger_id, 'ride_updated', 'שינוי בנסיעה קבועה',
      'הנסיעה הקבועה שאתה רשום אליה עודכנה. כדאי לבדוק את השעה החדשה.',
      '/ride/' || v_b.ride_id);
  end loop;

  perform log_audit(t.org_id, 'ride_template', p_template, 'update',
                    jsonb_build_object('rides_updated', v_updated));
  return v_updated;
end $$;

revoke all on function update_template(uuid,int[],time,int,numeric,uuid,text,boolean,boolean)
  from public, anon;
grant execute on function update_template(uuid,int[],time,int,numeric,uuid,text,boolean,boolean)
  to authenticated;
