#!/bin/sh
# Restores a backup made by backup.sh.
#
#   TARGET_DATABASE_URL=postgresql://.../roshd_restore ./restore.sh /backups/roshd-20261001T010000Z [--files /restore/storage]
#
# Safety rules:
#   - checksums are verified before anything is touched;
#   - the target database must be empty (a fresh database), unless ALLOW_NON_EMPTY=yes;
#   - files are extracted only into an explicit, empty directory (--files).
# Restoring over production is a deliberate, two-step operation: restore into a new database,
# check it, then switch DATABASE_URL (see docs/operations/backup-restore.md).
set -eu

usage() {
  echo "usage: TARGET_DATABASE_URL=... $0 <backup base path without extension> [--files <empty dir>]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
base="$1"
shift
files_dir=""
if [ "${1:-}" = "--files" ]; then
  [ $# -ge 2 ] || usage
  files_dir="$2"
fi
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"

dir="$(dirname "$base")"
name="$(basename "$base")"
[ -f "$base.dump" ] || { echo "restore: $base.dump not found" >&2; exit 1; }
[ -f "$base.sha256" ] || { echo "restore: $base.sha256 not found" >&2; exit 1; }

echo "restore: verifying checksums"
(cd "$dir" && sha256sum -c "$name.sha256")

tables="$(psql "$TARGET_DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" != "0" ] && [ "${ALLOW_NON_EMPTY:-no}" != "yes" ]; then
  echo "restore: target database is not empty ($tables tables). Use a fresh database." >&2
  exit 1
fi

echo "restore: database ← $base.dump"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DATABASE_URL" "$base.dump"

if [ -n "$files_dir" ]; then
  [ -f "$base-files.tar.gz" ] || { echo "restore: $base-files.tar.gz not found" >&2; exit 1; }
  mkdir -p "$files_dir"
  if [ -n "$(ls -A "$files_dir")" ]; then
    echo "restore: $files_dir is not empty" >&2
    exit 1
  fi
  echo "restore: files ← $base-files.tar.gz"
  tar -xzf "$base-files.tar.gz" -C "$files_dir"
fi

echo "restore: row counts in the restored database"
psql "$TARGET_DATABASE_URL" -c "
  select 'users' as table_name, count(*) from users
  union all select 'service_requests', count(*) from service_requests
  union all select 'content_entries', count(*) from content_entries
  union all select 'files', count(*) from files
  union all select 'orders', count(*) from orders
  union all select 'audit_logs', count(*) from audit_logs
  union all select '_prisma_migrations', count(*) from _prisma_migrations"
echo "restore: done"
