-- ============================================================================
-- חבילה 2 — מה מנהל המערכת רואה
--
-- לא רק "שהפונקציה עובדת", אלא שהמספרים בה נכונים. מסך שמראה מספר שגוי
-- גרוע ממסך שלא קיים, כי מקבלים לפיו החלטות.
-- ============================================================================

\set SUITE '''מסך הניהול'''

set role authenticated;
select t_login('00000000-0000-4000-8000-0000000000a1');   -- מנהל מערכת

select t_check(:SUITE, 'מזוהה כמנהל מערכת', is_platform_admin());

-- ---------------------------------------------------------------- ארגונים
select t_check(:SUITE, 'רואה את שני הארגונים', t_count('select 1 from admin_list_orgs()') = 2);

select t_check(:SUITE, 'ספירת החברים בארגון א נכונה',
       (select members_total from admin_list_orgs() where join_code = 'AAA111') = 2);
select t_check(:SUITE, 'ספירת הפעילים בארגון א נכונה',
       (select members_active from admin_list_orgs() where join_code = 'AAA111') = 2);
select t_check(:SUITE, 'ממתין לאישור בארגון ב נספר',
       (select members_pending from admin_list_orgs() where join_code = 'BBB222') = 1);
select t_check(:SUITE, 'ספירת הנסיעות נכונה',
       (select rides from admin_list_orgs() where join_code = 'AAA111') = 1);
select t_check(:SUITE, 'ספירת הכניסות בארגון א נכונה',
       (select logins from admin_list_orgs() where join_code = 'AAA111') = 2);
select t_check(:SUITE, 'ארגון בלי פעילות מציג אפסים',
       (select rides = 0 and logins = 0 from admin_list_orgs() where join_code = 'BBB222'));
select t_check(:SUITE, 'שום ארגון אינו מושהה בהתחלה',
       t_count('select 1 from admin_list_orgs() where suspended_at is not null') = 0);

-- --------------------------------------------------------------- משתמשים
select t_check(:SUITE, 'רואה את כל ששת החשבונות',
       t_count('select 1 from admin_list_users()') = 6);
select t_check(:SUITE, 'חשבון בלי ארגון מופיע בלי שיוך',
       (select org_id is null from admin_list_users() where email = 'nobody@test.invalid'));
select t_check(:SUITE, 'מנהל מערכת מסומן ככזה',
       (select is_admin from admin_list_users() where email = 'admin@test.invalid'));
select t_check(:SUITE, 'משתמש רגיל אינו מסומן כמנהל מערכת',
       (select not is_admin from admin_list_users() where email = 'mgr-a@test.invalid'));
select t_check(:SUITE, 'תפקיד מנהל ארגון מוצג נכון',
       (select member_role = 'manager' from admin_list_users() where email = 'mgr-a@test.invalid'));
select t_check(:SUITE, 'סטטוס ממתין לאישור מוצג נכון',
       (select member_status = 'pending' from admin_list_users() where email = 'pend-b@test.invalid'));
select t_check(:SUITE, 'נסיעות כנהג נספרות',
       (select rides_driven = 1 and rides_taken = 0 from admin_list_users() where email = 'mgr-a@test.invalid'));
select t_check(:SUITE, 'נסיעות כנוסע נספרות',
       (select rides_driven = 0 and rides_taken = 1 from admin_list_users() where email = 'mem-a@test.invalid'));
select t_check(:SUITE, 'מונה הכניסות מוצג',
       (select login_count = 1 from admin_list_users() where email = 'mem-a@test.invalid'));
select t_check(:SUITE, 'מי שלא נכנס מעולם מוצג עם אפס',
       (select login_count = 0 from admin_list_users() where email = 'nobody@test.invalid'));

select t_check(:SUITE, 'סינון לארגון מחזיר רק את חבריו',
       t_count('select 1 from admin_list_users((select id from admin_list_orgs() where join_code = ''AAA111''))') = 2);

-- ------------------------------------------------------------ תמונת מצב
select t_check(:SUITE, 'תמונת המצב מחזירה את הארגון הנכון',
       (admin_org_detail((select id from admin_list_orgs() where join_code = 'AAA111'))->>'name') = 'ארגון א');
select t_check(:SUITE, 'תמונת המצב סופרת נהגים',
       (admin_org_detail((select id from admin_list_orgs() where join_code = 'AAA111'))->>'drivers')::int = 1);
select t_check(:SUITE, 'תמונת המצב סופרת הרשמות מאושרות',
       (admin_org_detail((select id from admin_list_orgs() where join_code = 'AAA111'))->>'bookings')::int = 1);
select t_check(:SUITE, 'תמונת המצב סופרת נקודות איסוף',
       (admin_org_detail((select id from admin_list_orgs() where join_code = 'AAA111'))->>'stops')::int = 1);
select t_check(:SUITE, 'תמונת המצב יודעת מי פתח את הארגון',
       (admin_org_detail((select id from admin_list_orgs() where join_code = 'AAA111'))->>'opened_by') = 'מנהלת ארגון א');
select t_denied(:SUITE, 'תמונת מצב של ארגון שלא קיים נכשלת',
       'select admin_org_detail(gen_random_uuid())');

-- --------------------------------------------- מה מנהל המערכת עדיין לא רואה
-- ההרשאה שלו היא לפונקציות, לא לטבלאות. גם לו אין דלת אחורית.
select t_check(:SUITE, 'גם מנהל מערכת לא קורא את טבלת הארגונים ישירות',
       t_count('select 1 from orgs') = 0);
select t_check(:SUITE, 'גם מנהל מערכת לא קורא את טבלת החברים ישירות',
       t_count('select 1 from members') = 0);
select t_check(:SUITE, 'גם מנהל מערכת לא רואה חיובים',
       t_count('select 1 from charges') = 0);
select t_check(:SUITE, 'גם מנהל מערכת לא רואה פרטי קשר',
       t_count('select 1 from member_contacts') = 0);
select t_denied(:SUITE, 'גם מנהל מערכת לא קורא את טבלת מנהלי המערכת',
       'select * from platform_admins');

-- כן רואה את תור הבקשות — זו כל העבודה שלו
select t_check(:SUITE, 'רואה את כל בקשות פתיחת הארגון',
       t_count('select 1 from org_requests') = 2);

-- ---------------------------------------------------- מונה הכניסות
-- שתי קריאות רצופות אינן שתי כניסות: רענון של דף אינו כניסה חדשה
reset role; set role authenticated;
select t_login('00000000-0000-4000-8000-0000000000a3');
select record_login();
select record_login();
select record_login();

reset role; set role authenticated;
select t_login('00000000-0000-4000-8000-0000000000a1');
select t_check(:SUITE, 'שלוש קריאות ברצף נספרות ככניסה אחת',
       (select login_count = 1 from admin_list_users() where email = 'mem-a@test.invalid'));

reset role;
select t_login(null);
