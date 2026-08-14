-- ============================================================================
-- שומרי סף על עמודות רגישות
--
-- למה זה נחוץ: הגנת השורות (RLS) עובדת ברמת שורה שלמה, לא ברמת עמודה.
-- כלומר "מותר לך לעדכן את השורה של עצמך" נתן בפועל גם "מותר לך לשנות את
-- עמודת התפקיד שלך למנהל". נמצא בבדיקה בפועל: נוסעת רגילה הפכה את עצמה
-- למנהלת ואז מחקה חבר אחר.
--
-- הפתרון: טריגרים שחוסמים שינוי של עמודות רגישות. הטריגרים פועלים בזכויות
-- הקורא (invoker) ולא בזכויות הבעלים, ולכן current_user מזהה מי באמת מבצע:
--   'authenticated' = פנייה ישירה מהדפדפן  → השומר פעיל
--   'postgres'      = פעולה מתוך פונקציה עסקית או משימה מתוזמנת → מותר
--   'service_role'  = פונקציית שרת (הרשמה)  → מותר
-- כך הכללים נאכפים בלי לשנות אף פונקציה עסקית קיימת.
-- ============================================================================

create or replace function guard_active() returns boolean
language sql stable as $$ select current_user = 'authenticated' $$;

-- ---------- חברים: תפקיד, סטטוס, שם ומזהי כניסה ----------
create or replace function members_guard() returns trigger
language plpgsql as $$
declare v_mgr boolean;
begin
  if not guard_active() then return new; end if;
  v_mgr := is_manager();

  -- לעולם לא משתנים, גם לא בידי מנהל
  if new.org_id    is distinct from old.org_id    then raise exception 'אי אפשר להעביר חבר בין ארגונים'; end if;
  if new.user_id   is distinct from old.user_id   then raise exception 'אי אפשר לשנות את מזהה המשתמש'; end if;
  if new.login_key is distinct from old.login_key then raise exception 'אי אפשר לשנות את מזהה הכניסה'; end if;

  if not v_mgr then
    if new.role   is distinct from old.role   then raise exception 'רק מנהל יכול לשנות תפקיד'; end if;
    if new.status is distinct from old.status then raise exception 'רק מנהל יכול לשנות סטטוס של חבר'; end if;
    if new.name   is distinct from old.name   then raise exception 'אי אפשר לשנות שם — השם משמש לכניסה לכלי'; end if;
  end if;

  -- אסור להשאיר ארגון בלי מנהל
  if old.role = 'manager' and new.role <> 'manager'
     and (select count(*) from members
          where org_id = old.org_id and role = 'manager' and status = 'active') <= 1 then
    raise exception 'זה המנהל היחיד בארגון — צריך למנות מנהל אחר לפני השינוי';
  end if;

  return new;
end $$;

drop trigger if exists members_guard_trg on members;
create trigger members_guard_trg before update on members
for each row execute function members_guard();

-- מחיקת החבר האחרון שהוא מנהל תשאיר ארגון נעול
create or replace function members_guard_delete() returns trigger
language plpgsql as $$
begin
  if not guard_active() then return old; end if;
  if old.role = 'manager'
     and (select count(*) from members
          where org_id = old.org_id and role = 'manager' and status = 'active') <= 1 then
    raise exception 'אי אפשר למחוק את המנהל היחיד בארגון';
  end if;
  return old;
end $$;

drop trigger if exists members_guard_delete_trg on members;
create trigger members_guard_delete_trg before delete on members
for each row execute function members_guard_delete();

-- ---------- הרשמות: מי רשאי לשנות סטטוס ----------
-- בלי זה נוסע היה יכול לרשום את עצמו ישירות כ"מאושר" ולעקוף את אישור הנהג.
create or replace function bookings_guard_insert() returns trigger
language plpgsql as $$
begin
  if not guard_active() then return new; end if;
  if is_ride_driver(new.ride_id) or is_manager() then return new; end if;
  if new.passenger_id <> current_member_id() then
    raise exception 'אפשר להירשם רק בשם עצמך';
  end if;
  if new.status <> 'requested' then
    raise exception 'הרשמה חדשה חייבת להתחיל כבקשה הממתינה לאישור הנהג';
  end if;
  return new;
end $$;

create or replace function bookings_guard_update() returns trigger
language plpgsql as $$
declare v_me uuid;
begin
  if not guard_active() then return new; end if;
  v_me := current_member_id();

  if new.ride_id      is distinct from old.ride_id
  or new.passenger_id is distinct from old.passenger_id
  or new.org_id       is distinct from old.org_id then
    raise exception 'אי אפשר לשנות את הנסיעה או את הנוסע של הרשמה קיימת';
  end if;

  if new.status is distinct from old.status
     and not (is_ride_driver(new.ride_id) or is_manager()) then
    -- הנוסע עצמו רשאי רק לבטל את עצמו
    if not (old.passenger_id = v_me and new.status = 'cancelled') then
      raise exception 'רק הנהג של הנסיעה יכול לשנות את סטטוס ההרשמה';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_guard_insert_trg on bookings;
create trigger bookings_guard_insert_trg before insert on bookings
for each row execute function bookings_guard_insert();

drop trigger if exists bookings_guard_update_trg on bookings;
create trigger bookings_guard_update_trg before update on bookings
for each row execute function bookings_guard_update();

-- ---------- תשלומים: אי אפשר לאשר לעצמך ----------
-- בלי זה משלם היה יכול להוסיף תשלום מסומן כ"אושר" ולמחוק את החוב שלו לבד.
create or replace function payments_guard_insert() returns trigger
language plpgsql as $$
begin
  if not guard_active() then return new; end if;
  if new.payer_id <> current_member_id() then
    raise exception 'אפשר לסמן תשלום רק בשם עצמך';
  end if;
  if new.status <> 'marked' then
    raise exception 'תשלום חדש תמיד נכנס כ"ממתין לאישור" — רק המקבל יכול לאשר';
  end if;
  if new.payee_id = new.payer_id then
    raise exception 'אי אפשר לשלם לעצמך';
  end if;
  new.confirmed_at   := null;
  new.confirmed_by   := null;
  new.auto_confirmed := false;
  return new;
end $$;

create or replace function payments_guard_update() returns trigger
language plpgsql as $$
begin
  if not guard_active() then return new; end if;
  if new.payer_id is distinct from old.payer_id
  or new.payee_id is distinct from old.payee_id
  or new.amount   is distinct from old.amount
  or new.org_id   is distinct from old.org_id then
    raise exception 'אי אפשר לשנות סכום או צדדים של תשלום קיים';
  end if;
  if new.status is distinct from old.status
     and not (old.payee_id = current_member_id() or is_manager()) then
    raise exception 'רק מי שאמור לקבל את הכסף יכול לאשר או לדחות';
  end if;
  return new;
end $$;

drop trigger if exists payments_guard_insert_trg on payments;
create trigger payments_guard_insert_trg before insert on payments
for each row execute function payments_guard_insert();

drop trigger if exists payments_guard_update_trg on payments;
create trigger payments_guard_update_trg before update on payments
for each row execute function payments_guard_update();

-- ---------- חיובים: נוצרים רק על ידי המערכת ----------
-- אין סיבה שדפדפן ייצור חיוב ישירות. חיוב נוצר בסגירת נסיעה, בביטול מאוחר
-- או ברישום ידני — כולם עוברים דרך פונקציה שאוכפת את הכללים.
drop policy if exists charges_write  on charges;
drop policy if exists charges_update on charges;
drop policy if exists charges_delete on charges;

create policy charges_delete on charges for delete to authenticated
  using (org_id = current_org_id() and is_manager());
