# Backup and restore

Scripts: [`infra/backup/backup.sh`](../../infra/backup/backup.sh) and [`infra/backup/restore.sh`](../../infra/backup/restore.sh). They run in any image that has the PostgreSQL 16 client tools (`postgres:16-alpine`).

## What is backed up

| Data                                              | How                                                          | File                            |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| PostgreSQL (all application data, audit log)      | `pg_dump --format=custom` (compressed, restorable per table) | `roshd-<UTC time>.dump`         |
| Private uploads (`STORAGE_LOCAL_DIR`, API volume) | `tar.gz`                                                     | `roshd-<UTC time>-files.tar.gz` |
| Integrity                                         | SHA-256 of both files, checked before every restore          | `roshd-<UTC time>.sha256`       |

Secrets (`.env`, JWT/file-URL secrets) are **not** in backups. Keep them in the secret store; without `FILE_URL_SECRET` old signed links stop working, which is harmless because they expire within minutes.

## Running a backup

```bash
# compose stack (infra/docker/compose.app.yml): writes to ./backups next to the compose file
docker compose -f infra/docker/compose.app.yml --profile ops run --rm backup

# any host with pg_dump
DATABASE_URL=postgresql://... BACKUP_DIR=/var/backups/roshd STORAGE_DIR=/srv/roshd/storage infra/backup/backup.sh
```

The script exits non-zero on any failure, so the scheduler can alert on it. Backups older than `BACKUP_RETENTION_DAYS` (default 14) are deleted. Only files named `roshd-*` are ever deleted.

## Recommended schedule (to confirm, OQ-12)

- **Daily** at a quiet hour (for example 02:30 Iran time) via cron or a systemd timer, keeping 14 days locally.
- **Off-site copy** of each run to storage outside the server, encrypted before upload (for example `age` or `gpg` with a key that is not stored on the server), kept for 90 days.
- **Before every release** that contains a migration: one extra manual backup.
- Proposed targets: data loss of at most 24 h (RPO) and service restored within 4 h (RTO). These are business decisions (OQ-12).

## Restoring

Restore **into a new database**, check it, then switch the API to it. The script refuses a target that already has tables, and it verifies checksums before touching anything.

```bash
createdb roshd_restored                       # or CREATE DATABASE via psql
TARGET_DATABASE_URL=postgresql://.../roshd_restored \
  infra/backup/restore.sh /var/backups/roshd/roshd-20261001T230000Z --files /srv/roshd/storage-restored
```

Then:

1. Check the row counts that the script prints against expectations.
2. Stop the API, point `DATABASE_URL` at the restored database and `STORAGE_LOCAL_DIR` at the restored files, run the `migrate` image (it only applies newer migrations), and start the API.
3. Check `/api/v1/health/ready`, sign in, and open a request with an attachment.
4. Record the incident and the restore in the audit notes.

## Restore drill

Run a restore drill **every month** and after any change to the backup setup: restore the latest backup into a scratch database, check the counts, then drop it. Last drill:

| Date       | Backup                         | Result | Notes                                                                                                                                                                                                               |
| ---------- | ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-26 | `roshd-20260926T101639Z` (dev) | ✅     | Restored into a fresh database; row counts equal to the source (users 1, requests 1, content 10, files 2, audit 6). Non-empty target refused. A corrupted dump was refused by the checksum check before any change. |
