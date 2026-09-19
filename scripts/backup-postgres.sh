#!/usr/bin/env bash
# PostgreSQL backup — pg_dump via Docker, retention 30 days
# Run daily via cron: 0 2 * * * /opt/ticketing-platform/scripts/backup-postgres.sh >> /var/log/zaya-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/var/backups/zaya/postgres"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/zaya_${TIMESTAMP}.sql.gz"

# Load env from .env if not already set
if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  source "$(dirname "$0")/../.env"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting backup → ${BACKUP_FILE}"

PGPASSWORD="${POSTGRES_PASSWORD}" docker exec ticketing_postgres \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup complete — ${SIZE}"

# Delete backups older than RETENTION_DAYS
DELETED=$(find "${BACKUP_DIR}" -name "zaya_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
echo "[$(date)] Purged ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
