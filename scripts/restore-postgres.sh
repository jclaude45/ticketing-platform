#!/usr/bin/env bash
# PostgreSQL restore from a backup file
# Usage: ./restore-postgres.sh /var/backups/zaya/postgres/zaya_20260919_020000.sql.gz

set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz>}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: File not found: ${BACKUP_FILE}"
  exit 1
fi

if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  source "$(dirname "$0")/../.env"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"

echo "WARNING: This will overwrite the database '${POSTGRES_DB}'. Press Ctrl+C to cancel."
echo "Restoring in 5 seconds..."
sleep 5

echo "[$(date)] Dropping and recreating database..."
PGPASSWORD="${POSTGRES_PASSWORD}" docker exec -i ticketing_postgres \
  psql -U "${POSTGRES_USER}" -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}; CREATE DATABASE ${POSTGRES_DB};"

echo "[$(date)] Restoring from ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD}" docker exec -i ticketing_postgres \
  psql -U "${POSTGRES_USER}" "${POSTGRES_DB}"

echo "[$(date)] Restore complete."
