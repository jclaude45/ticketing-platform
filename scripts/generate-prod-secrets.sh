#!/usr/bin/env bash
# Generates all production secrets and prints them as .env assignments.
# Run once on the VPS and paste the output into your .env file.
# Usage: bash scripts/generate-prod-secrets.sh >> /opt/ticketing-platform/.env

set -euo pipefail

generate() {
  openssl rand -hex 32
}

echo ""
echo "# ── Auto-generated secrets ($(date)) ──────────────────────────────"
echo "JWT_SECRET=$(generate)"
echo "JWT_REFRESH_SECRET=$(generate)"
echo "PRIVATE_KEY_ENCRYPTION_KEY=$(generate)"
echo "ACCREDITATION_HMAC_SECRET=$(generate)"
echo "REDIS_PASSWORD=$(generate)"
echo ""
echo "# Postgres — change the username/dbname to match your setup"
echo "POSTGRES_USER=zaya"
echo "POSTGRES_PASSWORD=$(generate)"
echo "POSTGRES_DB=zaya_prod"
echo ""
echo "# Fill these manually:"
echo "FLEXPAY_TOKEN=<regenerate_from_flexpay_portal>"
echo "TWILIO_ACCOUNT_SID=<from_twilio_console>"
echo "TWILIO_AUTH_TOKEN=<from_twilio_console>"
echo "TWILIO_PHONE_NUMBER=<your_twilio_number>"
echo "TWILIO_WHATSAPP_FROM=whatsapp:<your_twilio_whatsapp_number>"
echo "SMTP_HOST=<your_smtp_host>"
echo "SMTP_PORT=587"
echo "SMTP_USER=<your_smtp_user>"
echo "SMTP_PASS=<your_smtp_password>"
echo "EMAIL_FROM=noreply@zaya.live"
echo "FRONTEND_URL=https://zaya.live"
echo "APP_BASE_URL=https://zaya.live"
echo "NEXT_PUBLIC_API_URL=https://zaya.live/api/v1"
echo "NEXT_PUBLIC_WS_URL=wss://zaya.live"
echo "AWS_ACCESS_KEY_ID=<from_aws_console>"
echo "AWS_SECRET_ACCESS_KEY=<from_aws_console>"
echo "AWS_REGION=eu-west-1"
echo "AWS_S3_BUCKET=zaya-uploads-prod"
echo "# ────────────────────────────────────────────────────────────────────"
