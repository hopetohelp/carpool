#!/usr/bin/env bash
# ============================================================================
# הרצת בדיקות מסד הנתונים
#
#   ./tests/db/run.sh
#
# מקים מסד נקי, מריץ עליו את *המיגרציות האמיתיות* לפי הסדר, ואז את חבילות
# הבדיקה. יוצא בקוד שגיאה אם בדיקה אחת נכשלה, כדי שאפשר יהיה לתלות בזה.
#
# אם יש כבר Postgres זמין (למשל בבדיקה האוטומטית בענן) מגדירים PGHOST/PGPORT/
# PGUSER/PGPASSWORD והסקריפט ישתמש בו. אחרת הוא מקים אחד מקומי וזמני בעצמו.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${TEST_DB:-carpool_test}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------- מאיפה מגיע Postgres ----------
if [ -z "${PGHOST:-}" ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$PGBIN" ] || { echo "לא נמצא Postgres מותקן, ולא הוגדר PGHOST"; exit 1; }

  DATA="$TMP/data"
  # initdb מסרב לרוץ כ-root, ולכן כשמריצים כ-root עוברים למשתמש postgres
  if [ "$(id -u)" = "0" ]; then
    id -u postgres >/dev/null 2>&1 || useradd -m postgres
    DATA="$(mktemp -d -p /var/lib)"; chown postgres:postgres "$DATA"
    su postgres -c "$PGBIN/initdb -D $DATA/pg -U postgres --auth=trust" >/dev/null
    su postgres -c "$PGBIN/pg_ctl -D $DATA/pg -l $DATA/log -o '-k /tmp -p 55432 -h \"\"' -w start" >/dev/null
    trap 'su postgres -c "$PGBIN/pg_ctl -D $DATA/pg -m immediate stop" >/dev/null 2>&1; rm -rf "$TMP" "$DATA"' EXIT
  else
    "$PGBIN/initdb" -D "$DATA/pg" -U postgres --auth=trust >/dev/null
    "$PGBIN/pg_ctl" -D "$DATA/pg" -l "$DATA/log" -o "-k /tmp -p 55432 -h ''" -w start >/dev/null
    trap '"$PGBIN/pg_ctl" -D "$DATA/pg" -m immediate stop >/dev/null 2>&1; rm -rf "$TMP"' EXIT
  fi
  export PGHOST=/tmp PGPORT=55432 PGUSER=postgres
fi

psql -q -d postgres -c "drop database if exists $DB"
psql -q -d postgres -c "create database $DB"
RUN=(psql -q -d "$DB" -v ON_ERROR_STOP=1)

# ---------- סביבה ----------
"${RUN[@]}" -f "$ROOT/tests/db/00_env.sql" > /dev/null

# ---------- המיגרציות האמיתיות ----------
# pg_cron ו-pg_net אינם קיימים מחוץ ל-Supabase; הכל חוץ משתי שורות הטעינה
# שלהם רץ בדיוק כמו שהוא נפרס.
echo "── מיגרציות ──"
for f in "$ROOT"/supabase/migrations/*.sql; do
  sed -e 's/^create extension if not exists pg_cron.*$/-- pg_cron (לא קיים בבדיקה)/' \
      -e 's/^create extension if not exists pg_net.*$/-- pg_net (לא קיים בבדיקה)/' \
      "$f" > "$TMP/$(basename "$f")"
  "${RUN[@]}" -f "$TMP/$(basename "$f")" > /dev/null
  echo "   ✓ $(basename "$f")"
done

# ---------- הבדיקות ----------
echo "── בדיקות ──"
"${RUN[@]}" -f "$ROOT/tests/db/01_helpers.sql" > /dev/null
"${RUN[@]}" -f "$ROOT/tests/db/10_seed.sql"    > /dev/null

for f in "$ROOT"/tests/db/[2-8]0_*.sql; do
  "${RUN[@]}" -f "$f" > /dev/null
done

psql -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/tests/db/90_report.sql"
