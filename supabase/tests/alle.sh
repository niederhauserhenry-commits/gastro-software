#!/bin/sh
# Baut eine frische lokale Testdatenbank auf und lässt alle Tests laufen.
# Voraussetzung: ein lokaler PostgreSQL auf Port 5544 (siehe PLAN.md).
set -e
cd "$(dirname "$0")/../.."
P="psql -h /tmp -p 5544 -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists t" -c "create database t" >/dev/null
$P -d t -f supabase/tests/stub_auth.sql >/dev/null
for f in supabase/migrations/*.sql; do $P -d t -f "$f" 2>&1 | grep -v "pg_cron nicht" || true; done
for f in supabase/tests/test_*.sql; do
  printf '%s: ' "$f"
  $P -d t -At -f "$f" | tail -1
done
