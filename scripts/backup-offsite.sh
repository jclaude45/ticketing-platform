#!/usr/bin/env bash
# Daily encrypted off-site backup: database and uploaded files, to S3.
#
# Cron (user deploy):
#   30 2 * * * /opt/zaya/app/scripts/backup-offsite.sh >> /opt/zaya/backups/offsite.log 2>&1
#
# /opt/zaya/secrets (700, files 600):
#   backup.env   BACKUP_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
#                (an IAM user allowed only s3:PutObject on the bucket: the server can add
#                backups but never read or delete them)
#   backup.pass  gpg passphrase. Keep a copy OFF the server: without it no backup can be read.
#
# Restore (from a machine with read access to the bucket):
#   aws s3 cp s3://BUCKET/2026/11/db-20261113_023000.sql.gz.gpg - \
#     | gpg -d --batch --pinentry-mode loopback --passphrase-file backup.pass | gunzip > dump.sql
#   aws s3 cp s3://BUCKET/2026/11/uploads-20261113_023000.tar.gz.gpg - \
#     | gpg -d --batch --pinentry-mode loopback --passphrase-file backup.pass | tar -xz -C uploads/

set -euo pipefail
umask 077

SECRETS=/opt/zaya/secrets
PASS="${SECRETS}/backup.pass"
set -a
source "${SECRETS}/backup.env"
set +a
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is not set}"
[ -s "$PASS" ] || { echo "[$(date -u)] ERREUR: ${PASS} manquant"; exit 1; }

STAMP=$(date -u +%Y%m%d_%H%M%S)
DEST="s3://${BACKUP_S3_BUCKET}/$(date -u +%Y/%m)"

encrypt() {
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS" \
    --symmetric --cipher-algo AES256 --compress-algo none -o -
}

echo "[$(date -u)] Début de la sauvegarde ${STAMP}"

docker exec ticketing_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  | gzip | encrypt | aws s3 cp - "${DEST}/db-${STAMP}.sql.gz.gpg" --only-show-errors
echo "[$(date -u)] Base envoyée : ${DEST}/db-${STAMP}.sql.gz.gpg"

docker exec ticketing_backend tar -C /app/public/uploads -czf - . \
  | encrypt | aws s3 cp - "${DEST}/uploads-${STAMP}.tar.gz.gpg" --only-show-errors
echo "[$(date -u)] Fichiers envoyés : ${DEST}/uploads-${STAMP}.tar.gz.gpg"

echo "[$(date -u)] Sauvegarde terminée avec succès"
