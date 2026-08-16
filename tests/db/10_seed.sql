-- ============================================================================
-- נתוני הבדיקה
--
-- שני ארגונים ושישה חשבונות, שנבנים דרך אותן פונקציות שהכלי משתמש בהן —
-- בקשה, אישור, הצטרפות, פרסום נסיעה והרשמה אליה. כך הבדיקות רצות על מצב
-- שנוצר כמו במציאות, ולא על שורות שהוזרקו ידנית ועוקפות את הכללים.
--
-- כל השמות והכתובות כאן בדויים. הסיומת `.invalid` שמורה בתקן ולא יכולה
-- להתקיים באמת, ולכן אין סיכוי שהן יצביעו על אדם קיים.
-- ============================================================================

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@test.invalid',   '{"full_name":"מנהל מערכת"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'mgr-a@test.invalid',   '{"full_name":"מנהלת ארגון א"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'mem-a@test.invalid',   '{"full_name":"נוסע בארגון א"}'),
  ('00000000-0000-4000-8000-0000000000a4', 'nobody@test.invalid',  '{"full_name":"בלי ארגון"}'),
  ('00000000-0000-4000-8000-0000000000a5', 'mgr-b@test.invalid',   '{"full_name":"מנהל ארגון ב"}'),
  ('00000000-0000-4000-8000-0000000000a6', 'pend-b@test.invalid',  '{"full_name":"ממתין בארגון ב"}');

insert into platform_admin_emails(email) values ('admin@test.invalid');

-- ---------- שני ארגונים נפתחים דרך המסלול האמיתי ----------
set role authenticated;

select t_login('00000000-0000-4000-8000-0000000000a2');
select request_org('ארגון א', 'AAA111', 'מנהלת ארגון א', '050-0000000');

select t_login('00000000-0000-4000-8000-0000000000a5');
select request_org('ארגון ב', 'BBB222', 'מנהל ארגון ב');

select t_login('00000000-0000-4000-8000-0000000000a1');
select decide_org_request(id, true) from org_requests where join_code = 'AAA111';
select decide_org_request(id, true) from org_requests where join_code = 'BBB222';

-- ---------- מצטרפים ----------
select t_login('00000000-0000-4000-8000-0000000000a3');
select join_org('AAA111', 'נוסע בארגון א', '050-1111111', false);
select record_login();

select t_login('00000000-0000-4000-8000-0000000000a6');
select join_org('BBB222', 'ממתין בארגון ב');          -- נשאר ממתין לאישור בכוונה

-- ---------- מנהלת א מאשרת, מוסיפה נקודת איסוף ומפרסמת נסיעה ----------
select t_login('00000000-0000-4000-8000-0000000000a2');
select record_login();
update members set status = 'active' where name = 'נוסע בארגון א';

insert into stops(org_id, name, address)
select current_org_id(), 'נקודת בדיקה', 'רחוב בדוי 1';

insert into rides(org_id, driver_id, ride_date, depart_time, departs_at,
                  direction, seats_total, price)
select current_org_id(), current_member_id(), current_date + 2, '07:30',
       now() + interval '2 days', 'to_work', 4, 15;

-- ---------- הנוסע נרשם, המנהלת מאשרת ----------
-- אחרי האישור השניים "נוסעים יחד", וזה מה שפותח את הגישה לפרטי הקשר
select t_login('00000000-0000-4000-8000-0000000000a3');
select request_booking((select id from rides limit 1));

select t_login('00000000-0000-4000-8000-0000000000a2');
select decide_booking((select id from bookings limit 1), true);

reset role;
select t_login(null);
