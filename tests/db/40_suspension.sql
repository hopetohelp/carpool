-- ============================================================================
-- חבילה 3 — השהיה
--
-- ההשהיה נאכפת בשלוש פונקציות עזר שכל מדיניות ההרשאות בכלי נשענת עליהן.
-- לכן החבילה הזו בודקת לא רק "שהדגל נדלק", אלא שהגישה בפועל נעצרה — ושהיא
-- באמת חוזרת בהסרת ההשהיה, כי השהיה שאי אפשר לבטל היא מחיקה בתחפושת.
-- ============================================================================

\set SUITE '''השהיה'''
\set ADMIN '''00000000-0000-4000-8000-0000000000a1'''
\set MGR_A '''00000000-0000-4000-8000-0000000000a2'''
\set MEM_A '''00000000-0000-4000-8000-0000000000a3'''
\set NOBODY '''00000000-0000-4000-8000-0000000000a4'''

-- ======================================================== השהיית משתמש
set role authenticated;
select t_login(:ADMIN);
select admin_set_user_suspended(:MEM_A, true, 'בדיקה');

reset role; set role authenticated;
select t_login(:MEM_A);
select t_check(:SUITE, 'המושהה מקבל הסבר ולא מסך ריק', account_status() = 'user_suspended');
select t_check(:SUITE, 'המושהה מאבד את השיוך לארגון',   current_org_id() is null);
select t_check(:SUITE, 'המושהה לא רואה נסיעות',          t_count('select 1 from rides') = 0);
select t_check(:SUITE, 'המושהה לא רואה חיובים',          t_count('select 1 from charges') = 0);
select t_check(:SUITE, 'המושהה לא רואה התראות',          t_count('select 1 from notifications') = 0);
-- אבל את השורה של עצמו הוא חייב לראות, אחרת הוא נופל למבוי סתום
select t_check(:SUITE, 'המושהה עדיין רואה את השורה של עצמו',
       t_count('select 1 from members where user_id = auth.uid()') = 1);

select t_denied(:SUITE, 'מושהה לא מצטרף לארגון אחר', 'select join_org(''BBB222'', ''ניסיון'')');
select t_denied(:SUITE, 'מושהה לא מבקש לפתוח ארגון',  'select request_org(''חדש'', ''CCC333'', ''ניסיון'')');
select t_denied(:SUITE, 'מושהה לא נרשם לנסיעה',
       'select request_booking((select id from rides limit 1))');

-- ---------------------------------------------------------- הסרת ההשהיה
reset role; set role authenticated;
select t_login(:ADMIN);
select admin_set_user_suspended(:MEM_A, false);

reset role; set role authenticated;
select t_login(:MEM_A);
select t_check(:SUITE, 'אחרי הסרת ההשהיה המצב תקין',  account_status() = 'ok');
select t_check(:SUITE, 'אחרי הסרת ההשהיה הנסיעות חזרו', t_count('select 1 from rides') = 1);
select t_check(:SUITE, 'אחרי הסרת ההשהיה השיוך חזר',   current_org_id() is not null);

-- ========================================================= השהיית ארגון
reset role; set role authenticated;
select t_login(:ADMIN);
select admin_set_org_suspended((select id from admin_list_orgs() where join_code = 'AAA111'), true);
select t_check(:SUITE, 'הארגון מסומן כמושהה ברשימה',
       (select suspended_at is not null from admin_list_orgs() where join_code = 'AAA111'));

reset role; set role authenticated;
select t_login(:MGR_A);
select t_check(:SUITE, 'מנהל בארגון מושהה מקבל הסבר', account_status() = 'org_suspended');
select t_check(:SUITE, 'מנהל בארגון מושהה מאבד ניהול', is_manager() = false);
select t_check(:SUITE, 'מנהל בארגון מושהה לא רואה נסיעות', t_count('select 1 from rides') = 0);
select t_check(:SUITE, 'מנהל בארגון מושהה לא רואה חברים אחרים',
       t_count('select 1 from members where user_id <> auth.uid()') = 0);

reset role; set role authenticated;
select t_login(:MEM_A);
select t_check(:SUITE, 'גם חבר רגיל בארגון מושהה נעצר', account_status() = 'org_suspended');

reset role; set role authenticated;
select t_login(:NOBODY);
select t_denied(:SUITE, 'אי אפשר להצטרף לארגון מושהה', 'select join_org(''AAA111'', ''ניסיון'')');

-- ------------------------------------------------------- הפעלה מחדש
reset role; set role authenticated;
select t_login(:ADMIN);
select admin_set_org_suspended((select id from admin_list_orgs() where join_code = 'AAA111'), false);

reset role; set role authenticated;
select t_login(:MGR_A);
select t_check(:SUITE, 'אחרי הפעלה מחדש הכל חזר',
       account_status() = 'ok' and is_manager() and t_count('select 1 from rides') = 1);

reset role; set role authenticated;
select t_login(:NOBODY);
select t_allowed(:SUITE, 'אחרי הפעלה מחדש אפשר שוב להצטרף',
       'select join_org(''AAA111'', ''הצטרף אחרי הפעלה'')');

-- ------------------------------------------------------ מעצורי הבטיחות
reset role; set role authenticated;
select t_login(:ADMIN);
select t_denied(:SUITE, 'אי אפשר להשהות את החשבון של עצמך',
       'select admin_set_user_suspended(''00000000-0000-4000-8000-0000000000a1'', true)');
select t_denied(:SUITE, 'אי אפשר למחוק את החשבון של עצמך',
       'select admin_delete_user(''00000000-0000-4000-8000-0000000000a1'')');

-- ממנים מנהל מערכת נוסף, כדי לוודא שאי אפשר לפגוע בעמית. המינוי עצמו נעשה
-- במסד ולא מהממשק — וזה בדיוק העניין.
reset role;
insert into platform_admin_emails(email) values ('mgr-b@test.invalid');

set role authenticated;
select t_login(:ADMIN);
select t_denied(:SUITE, 'אי אפשר להשהות מנהל מערכת אחר',
       'select admin_set_user_suspended(''00000000-0000-4000-8000-0000000000a5'', true)');
select t_denied(:SUITE, 'אי אפשר למחוק מנהל מערכת אחר',
       'select admin_delete_user(''00000000-0000-4000-8000-0000000000a5'')');

reset role;
delete from platform_admin_emails where email = 'mgr-b@test.invalid';
select t_login(null);
