#!/bin/sh
# Backup of the PostgreSQL database and the private file storage.
#
#   DATABASE_URL=postgresql://... BACKUP_DIR=/backups STORAGE_DIR=/storage ./backup.sh
#
# Produces, per run, in $BACKUP_DIR:
#   roshd-<UTC timestamp>.dump        pg_dump custom format (compressed, restorable per table)
#   roshd-<UTC timestamp>-files.tar.gz private uploads (skipped when STORAGE_DIR is empty)
#   roshd-<UTC timestamp>.sha256      checksums of both files
# Backups older than BACKUP_RETENTION_DAYS (default 14) are deleted afterwards.
# Exit code is non-zero on any failure, so schedulers can alert on it.
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$BACKUP_DIR/roshd-$stamp"
mkdir -p "$BACKUP_DIR"

echo "backup: database → $base.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$base.dump.tmp"
mv "$base.dump.tmp" "$base.dump"

files=""
if [ -n "$STORAGE_DIR" ] && [ -d "$STORAGE_DIR" ]; then
  echo "backup: files → $base-files.tar.gz"
  tar -czf "$base-files.tar.gz.tmp" -C "$STORAGE_DIR" .
  mv "$base-files.tar.gz.tmp" "$base-files.tar.gz"
  files="$(basename "$base-files.tar.gz")"
fi

(cd "$BACKUP_DIR" && sha256sum "$(basename "$base.dump")" $files > "$(basename "$base.sha256")")
echo "backup: checksums → $base.sha256"

# Retention: only files created by this script are ever deleted.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'roshd-*' -mtime +"$RETENTION_DAYS" -print -delete

echo "backup: done ($stamp)"
