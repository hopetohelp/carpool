-- ============================================================================
-- חבילה 1 — מי לא רשאי למה
--
-- זו החבילה החשובה בקובץ. היא לא בודקת שהממשק מסתיר כפתור, אלא שמסד
-- הנתונים עצמו חוסם — כי מי שרוצה לעקוף לא ישתמש בממשק.
-- ============================================================================

\set SUITE '''הרשאות'''

-- ---------------------------------------------------------------- אורח
set role anon;
select t_login(null);

select t_denied(:SUITE, 'אורח: admin_list_orgs',           'select admin_list_orgs()');
select t_denied(:SUITE, 'אורח: admin_list_users',          'select admin_list_users()');
select t_denied(:SUITE, 'אורח: admin_org_detail',          'select admin_org_detail(gen_random_uuid())');
select t_denied(:SUITE, 'אורח: admin_set_org_suspended',   'select admin_set_org_suspended(gen_random_uuid(), true)');
select t_denied(:SUITE, 'אורח: admin_delete_org',          'select admin_delete_org(gen_random_uuid())');
select t_denied(:SUITE, 'אורח: admin_set_user_suspended',  'select admin_set_user_suspended(gen_random_uuid(), true)');
select t_denied(:SUITE, 'אורח: admin_delete_user',         'select admin_delete_user(gen_random_uuid())');
select t_denied(:SUITE, 'אורח: account_status',            'select account_status()');
select t_denied(:SUITE, 'אורח: record_login',              'select record_login()');

select t_denied(:SUITE, 'אורח: קריאת orgs',                'select * from orgs');
select t_denied(:SUITE, 'אורח: קריאת members',             'select * from members');
select t_denied(:SUITE, 'אורח: קריאת member_contacts',     'select * from member_contacts');
select t_denied(:SUITE, 'אורח: קריאת rides',               'select * from rides');
select t_denied(:SUITE, 'אורח: קריאת charges',             'select * from charges');
select t_denied(:SUITE, 'אורח: קריאת org_requests',        'select * from org_requests');
select t_denied(:SUITE, 'אורח: קריאת platform_admins',     'select * from platform_admins');
select t_denied(:SUITE, 'אורח: קריאת platform_admin_emails','select * from platform_admin_emails');
select t_denied(:SUITE, 'אורח: קריאת user_activity',       'select * from user_activity');
select t_denied(:SUITE, 'אורח: קריאת suspended_users',     'select * from suspended_users');
select t_denied(:SUITE, 'אורח: קריאת app_config',          'select * from app_config');

-- החריג היחיד, ובכוונה: מונים על כלל המערכת בלי שום פילוח
select t_check(:SUITE, 'אורח: public_stats כן עובדת', public_stats() is not null);
reset role;

-- ------------------------------------------------------- משתמש מחובר רגיל
set role authenticated;
select t_login('00000000-0000-4000-8000-0000000000a3');   -- נוסע בארגון א

select t_check(:SUITE, 'משתמש רגיל אינו מנהל מערכת', is_platform_admin() = false);

select t_denied(:SUITE, 'משתמש רגיל: admin_list_orgs',          'select admin_list_orgs()');
select t_denied(:SUITE, 'משתמש רגיל: admin_list_users',         'select admin_list_users()');
select t_denied(:SUITE, 'משתמש רגיל: admin_org_detail',         'select admin_org_detail(gen_random_uuid())');
select t_denied(:SUITE, 'משתמש רגיל: admin_set_org_suspended',  'select admin_set_org_suspended(gen_random_uuid(), true)');
select t_denied(:SUITE, 'משתמש רגיל: admin_delete_org',         'select admin_delete_org(gen_random_uuid())');
select t_denied(:SUITE, 'משתמש רגיל: admin_set_user_suspended', 'select admin_set_user_suspended(gen_random_uuid(), true)');
select t_denied(:SUITE, 'משתמש רגיל: admin_delete_user',        'select admin_delete_user(gen_random_uuid())');
select t_denied(:SUITE, 'משתמש רגיל: הכרעה בבקשת ארגון',
       'select decide_org_request((select id from org_requests limit 1), true)');

select t_denied(:SUITE, 'משתמש רגיל: קריאת platform_admins',      'select * from platform_admins');
select t_denied(:SUITE, 'משתמש רגיל: קריאת platform_admin_emails','select * from platform_admin_emails');
select t_denied(:SUITE, 'משתמש רגיל: קריאת user_activity',        'select * from user_activity');
select t_denied(:SUITE, 'משתמש רגיל: קריאת suspended_users',      'select * from suspended_users');
select t_denied(:SUITE, 'משתמש רגיל: קריאת app_config',           'select * from app_config');

-- ---------------------------------------------- גבולות בין ארגונים
select t_check(:SUITE, 'רואה רק את החברים בארגון שלו',
       t_count('select 1 from members') = 2);
select t_check(:SUITE, 'לא רואה נסיעות של ארגון אחר',
       t_count('select 1 from rides where org_id <> current_org_id()') = 0);
select t_check(:SUITE, 'לא רואה בקשות ארגון של אחרים',
       t_count('select 1 from org_requests') = 0);

-- --------------------------------------- שומרי עמודות (פרצות שנמצאו בעבר)
select t_denied(:SUITE, 'נוסע לא ממנה את עצמו למנהל',
       'update members set role = ''manager'' where id = current_member_id()');
select t_denied(:SUITE, 'נוסע לא משנה לעצמו סטטוס',
       'update members set status = ''blocked'' where id = current_member_id()');
select t_denied(:SUITE, 'נוסע לא מעביר את עצמו לארגון אחר',
       'update members set org_id = gen_random_uuid() where id = current_member_id()');
select t_denied(:SUITE, 'אי אפשר ליצור חיוב ישירות',
       'insert into charges(org_id, payer_id, payee_id, amount)
        select current_org_id(), current_member_id(), current_member_id(), 100');
select t_denied(:SUITE, 'אי אפשר להזין תשלום כמאושר',
       'insert into payments(org_id, payer_id, payee_id, amount, status)
        select current_org_id(), current_member_id(),
               (select id from members where id <> current_member_id() limit 1), 50, ''confirmed''');

-- ------------------------------------------------- השהיית ארגון אינה בידיו
reset role; set role authenticated;
select t_login('00000000-0000-4000-8000-0000000000a2');   -- מנהלת ארגון א
select t_check(:SUITE, 'מנהלת הארגון היא אכן מנהלת', is_manager());
select t_denied(:SUITE, 'מנהל ארגון לא משהה את הארגון של עצמו',
       'update orgs set suspended_at = now() where id = current_org_id()');
select t_allowed(:SUITE, 'ועדכון לגיטימי של הארגון עדיין עובד',
       'update orgs set settings = settings where id = current_org_id()');

reset role;
select t_login(null);
