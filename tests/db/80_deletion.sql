-- ============================================================================
-- חבילה 4 — מחיקה
--
-- מחיקה היא הפעולה היחידה כאן שאין ממנה דרך חזרה, ולכן היא נבדקת הכי
-- בקפדנות: שהיא מוחקת את מה שצריך, שהיא לא משאירה שורות יתומות, ושהיא
-- מדווחת על מה שנשבר בעקבותיה במקום להשאיר את זה בשקט.
-- ============================================================================

\set SUITE '''מחיקה'''
\set ADMIN '''00000000-0000-4000-8000-0000000000a1'''
\set MGR_A '''00000000-0000-4000-8000-0000000000a2'''
\set MEM_A '''00000000-0000-4000-8000-0000000000a3'''
\set MGR_B '''00000000-0000-4000-8000-0000000000a5'''

-- =================================================== מחיקת חבר רגיל
set role authenticated;
select t_login(:ADMIN);

select t_check(:SUITE, 'המחיקה מדווחת על חברות אחת שנמחקה',
       (admin_delete_user(:MEM_A)->>'memberships')::int = 1);

select t_check(:SUITE, 'החשבון כבר לא משויך לאף ארגון',
       (select org_id is null from admin_list_users() where email = 'mem-a@test.invalid'));
select t_check(:SUITE, 'החשבון מסומן כמושהה עד שיימחק בשירות האימות',
       (select suspended_at is not null from admin_list_users() where email = 'mem-a@test.invalid'));

reset role;
select t_check(:SUITE, 'ההרשמה שלו לנסיעה נמחקה איתו', (select count(*) from bookings) = 0);
select t_check(:SUITE, 'הנסיעה עצמה לא נמחקה',          (select count(*) from rides) = 1);

-- ========================================================= מחיקת ארגון
set role authenticated;
select t_login(:ADMIN);

select t_check(:SUITE, 'המחיקה מחזירה את שם הארגון שנמחק',
       (admin_delete_org((select id from admin_list_orgs() where join_code = 'AAA111'))->>'name') = 'ארגון א');
select t_check(:SUITE, 'נשאר ארגון אחד', t_count('select 1 from admin_list_orgs()') = 1);

reset role;
select t_check(:SUITE, 'החברים בארגון נמחקו איתו',
       (select count(*) from members m join orgs o on o.id = m.org_id
         where o.join_code = 'AAA111') = 0);
select t_check(:SUITE, 'לא נשארו חברים יתומים',
       (select count(*) from members m where not exists
         (select 1 from orgs o where o.id = m.org_id)) = 0);
select t_check(:SUITE, 'הנסיעות של הארגון נמחקו', (select count(*) from rides) = 0);
select t_check(:SUITE, 'נקודות האיסוף נמחקו',      (select count(*) from stops) = 0);
select t_check(:SUITE, 'לא נשארו חיובים יתומים',   (select count(*) from charges) = 0);
select t_check(:SUITE, 'לא נשארו התראות יתומות',
       (select count(*) from notifications n where not exists
         (select 1 from members m where m.id = n.member_id)) = 0);

-- היסטוריית הבקשה נשמרת — היא התיעוד של מי ביקש ומתי אושר. רק ההפניה
-- לארגון שנמחק מתנתקת, אחרת המחיקה הייתה נחסמת.
select t_check(:SUITE, 'היסטוריית הבקשות נשמרה', (select count(*) from org_requests) = 2);
select t_check(:SUITE, 'הבקשה של הארגון שנמחק כבר לא מפנה אליו',
       (select org_id is null from org_requests where join_code = 'AAA111'));

-- ================================== מחיקת המנהל היחיד — עוברת, אבל מדווחת
-- מנהל ארגון ב הוא המנהל הפעיל היחיד שלו. לא חוסמים את המחיקה, אבל אסור
-- שארגון יישאר בלי מנהל בשקט — הוא לא יוכל לאשר מצטרפים ולסגור חודש.
set role authenticated;
select t_login(:ADMIN);

select t_check(:SUITE, 'המחיקה מדווחת על ארגון שנשאר בלי מנהל',
       (admin_delete_user(:MGR_B)->'orgs_without_manager') = '["ארגון ב"]'::jsonb);

reset role;
select t_check(:SUITE, 'הבקשה שהמשתמש שנמחק הגיש נמחקה איתו',
       (select count(*) from org_requests) = 1);
select t_check(:SUITE, 'בארגון ב נשאר רק החבר הממתין',
       (select count(*) from members m join orgs o on o.id = m.org_id
         where o.join_code = 'BBB222') = 1);

-- ============================ אי אפשר למחוק ארגון שאתה עצמך חבר בו
-- מעצור שמונע ממנהל מערכת למחוק בטעות את הארגון שהוא עצמו עובד בו
set role authenticated;
select t_login(:ADMIN);
select join_org('BBB222', 'מנהל מערכת שהצטרף');

select t_denied(:SUITE, 'אי אפשר למחוק ארגון שאתה חבר בו',
       'select admin_delete_org((select id from admin_list_orgs() where join_code = ''BBB222''))');

reset role;
select t_login(null);
