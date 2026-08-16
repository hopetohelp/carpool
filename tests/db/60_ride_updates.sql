-- ============================================================================
-- חבילה 5 — עדכון נסיעה, ומי יודע עליה
--
-- שתי התנהגויות שקל לשבור בלי לשים לב: התראה שנשלחת למי שלא צריך, והתראה
-- שלא נשלחת למי שכן. במיוחד ההבחנה בין פעולה של אדם לפעולה של המערכת —
-- משימה מתוזמנת שנועלת מאה נסיעות אסור שתייצר מאה התראות.
-- ============================================================================

\set SUITE '''עדכון נסיעה'''
\set ADMIN '''00000000-0000-4000-8000-0000000000a1'''
\set MGR_A '''00000000-0000-4000-8000-0000000000a2'''
\set MEM_A '''00000000-0000-4000-8000-0000000000a3'''

-- מנקים התראות קודמות כדי לספור רק את מה שנוצר כאן
reset role;
delete from notifications;

-- ============================================ פרסום נסיעה מודיע לארגון
set role authenticated;
select t_login(:MGR_A);
insert into rides(org_id, driver_id, ride_date, depart_time, departs_at,
                  direction, seats_total, price)
select current_org_id(), current_member_id(), current_date + 5, '08:15',
       now() + interval '5 days', 'to_work', 3, 12;
reset role;

select t_check(:SUITE, 'פרסום נסיעה מודיע לשאר חברי הארגון',
       (select count(*) from notifications where kind = 'ride_published') = 1);
select t_check(:SUITE, 'הנהג עצמו לא מקבל התראה על הנסיעה שלו',
       (select count(*) from notifications n
          join members m on m.id = n.member_id
         where n.kind = 'ride_published' and m.name = 'מנהלת ארגון א') = 0);
select t_check(:SUITE, 'ההתראה כוללת את השעה שנקבעה',
       (select body like '%08:15%' from notifications where kind = 'ride_published' limit 1));

-- ================================== עדכון נסיעה מודיע לנוסעים הרשומים
reset role;
delete from notifications;

-- מעדכנים דווקא את הנסיעה מהנתונים ההתחלתיים, כי לה יש נוסע רשום —
-- נסיעה בלי נוסעים לא אמורה לייצר התראות, וזה לא מה שנבדק כאן
set role authenticated;
select t_login(:MGR_A);
update rides set depart_time = '08:45'
 where driver_id = current_member_id() and ride_date = current_date + 2;
reset role;

select t_check(:SUITE, 'שינוי שעה מודיע לנוסע שכבר רשום',
       (select count(*) from notifications where kind = 'ride_updated') >= 1);
select t_check(:SUITE, 'ההתראה אומרת מה בדיוק השתנה',
       (select body like '%08:45%' from notifications where kind = 'ride_updated' limit 1));

-- ------------------------------------ שינוי סטטוס בידי המערכת אינו שינוי
reset role;
delete from notifications;
-- זו בדיוק הפעולה שהמשימה המתוזמנת עושה: נעילת נסיעה לפני היציאה
update rides set status = 'locked'
 where ride_date = current_date + 5 and status in ('open','full');

select t_check(:SUITE, 'נעילה אוטומטית בידי המערכת לא מייצרת התראות',
       (select count(*) from notifications) = 0);

-- ============================================ נסיעה קבועה חדשה
reset role;
delete from notifications;

set role authenticated;
select t_login(:MGR_A);
insert into ride_templates(org_id, driver_id, days_of_week, depart_time,
                           direction, seats_total, price)
select current_org_id(), current_member_id(), array[0,1,2], '06:50', 'to_work', 4, 20;
reset role;

select t_check(:SUITE, 'נסיעה קבועה חדשה מודיעה פעם אחת, לא פעם לכל נסיעה',
       (select count(*) from notifications where kind = 'ride_recurring_new') = 1);
select t_check(:SUITE, 'ההתראה מפרטת את הימים בעברית',
       (select body like '%ראשון, שני, שלישי%' from notifications
         where kind = 'ride_recurring_new' limit 1));

-- ============================================ עדכון נסיעה קבועה
-- מייצרים נסיעה עתידית מהתבנית, כמו שהמשימה המתוזמנת הייתה עושה
reset role;
insert into rides(org_id, driver_id, template_id, ride_date, depart_time, departs_at,
                  direction, seats_total, price, status)
select t.org_id, t.driver_id, t.id,
       (current_date + ((7 + 1 - extract(dow from current_date)::int) % 7) + 7)::date,
       t.depart_time, now() + interval '8 days', t.direction, t.seats_total, t.price, 'open'
  from ride_templates t where t.depart_time = '06:50';
delete from notifications;

set role authenticated;
select t_login(:MGR_A);
select t_check(:SUITE, 'עדכון התבנית מיישר גם את הנסיעות שכבר פורסמו ממנה',
       update_template(
         (select id from ride_templates where depart_time = '06:50'),
         p_time := '07:20'
       ) >= 1);
reset role;

select t_check(:SUITE, 'הנסיעה העתידית קיבלה את השעה החדשה',
       (select count(*) from rides r
          join ride_templates t on t.id = r.template_id
         where t.price = 20 and r.depart_time = '07:20') = 1);
select t_check(:SUITE, 'התבנית עצמה עודכנה',
       (select depart_time from ride_templates where price = 20) = '07:20');

-- ------------------------------------- רק הנהג של התבנית רשאי לשנות אותה
set role authenticated;
select t_login(:MEM_A);
select t_denied(:SUITE, 'נוסע לא משנה נסיעה קבועה של נהג אחר',
       'select update_template((select id from ride_templates limit 1), p_time := ''05:00'')');
reset role;

-- ---------------------------------------------------------------- ניקוי
-- החבילה הזו מוסיפה נסיעה ותבנית לארגון קיים. חבילת המחיקה שרצה אחריה
-- סופרת שורות, ולכן מה שנוצר כאן נמחק כאן — בדיקה לא משאירה עקבות.
delete from rides where template_id in (select id from ride_templates where price = 20);
delete from ride_templates where price = 20;
delete from rides where ride_date = current_date + 5;
delete from notifications;

select t_login(null);
