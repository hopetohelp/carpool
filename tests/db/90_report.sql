-- ============================================================================
-- סיכום
--
-- מדפיס את מה שנכשל, ואז נכשל בעצמו. בלי השורה האחרונה ריצה כושלת הייתה
-- מסתיימת ב"הצלחה" ומחכה שמישהו יקרא את הפלט — וזה בדיוק מה שלא קורה.
-- ============================================================================

\pset pager off

select suite as חבילה,
       count(*)                              as בדיקות,
       count(*) filter (where passed)        as עברו,
       count(*) filter (where not passed)    as נכשלו
  from t_results
 group by suite
 order by min(id);

select name as "בדיקה שנכשלה", detail as פירוט
  from t_results where not passed order by id;

do $$
declare v_failed int; v_total int;
begin
  select count(*) filter (where not passed), count(*) into v_failed, v_total from t_results;
  if v_failed > 0 then
    raise exception 'נכשלו % בדיקות מתוך %', v_failed, v_total;
  end if;
  raise notice 'כל % הבדיקות עברו', v_total;
end $$;
