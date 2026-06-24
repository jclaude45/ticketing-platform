#!/usr/bin/env bash
# =============================================================================
# security-upgrade.sh — One-time security upgrade script
#
# Run this ONCE after deploying the security patch (June 2026).
# It applies the Prisma schema migration and re-encrypts all RSA private keys.
#
# Prerequisites:
#   - DATABASE_URL set (or .env loaded)
#   - PRIVATE_KEY_ENCRYPTION_KEY set
#   - Node.js + npm available
#   - Application is STOPPED or in maintenance mode during this script
#
# Usage:
#   cd ticketing-platform
#   export PRIVATE_KEY_ENCRYPTION_KEY="$(openssl rand -hex 32)"
#   ./scripts/security-upgrade.sh
# =============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[UPGRADE]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL ]${NC} $*"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║       Ticketing Platform — Security Upgrade          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 0. Sanity checks ──────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

cd "$BACKEND_DIR"

# Load .env if not already set
if [ -f ".env" ] && [ -z "${DATABASE_URL:-}" ]; then
  log "Loading .env file…"
  set -o allexport
  source .env
  set +o allexport
fi

[ -z "${DATABASE_URL:-}" ]              && fail "DATABASE_URL is not set"
[ -z "${PRIVATE_KEY_ENCRYPTION_KEY:-}" ] && fail "PRIVATE_KEY_ENCRYPTION_KEY is not set"

KEY_LEN=${#PRIVATE_KEY_ENCRYPTION_KEY}
[ "$KEY_LEN" -lt 32 ] && fail "PRIVATE_KEY_ENCRYPTION_KEY must be at least 32 characters (got $KEY_LEN)"

ok "Environment checks passed"

# ── 1. Install dependencies ───────────────────────────────────────────────────

log "Installing/verifying dependencies…"
npm ci --silent 2>/dev/null || npm install --silent
ok "Dependencies ready"

# ── 2. Generate Prisma client ──────────────────────────────────────────────────

log "Generating Prisma client…"
npx prisma generate
ok "Prisma client generated"

# ── 3. Apply Prisma migration ──────────────────────────────────────────────────

log "Applying database migrations…"
echo ""
echo "  Migration: 20260620000001_scan_validation_optional_ticket"
echo "  → Makes ScanValidation.ticketId nullable (H4 security fix)"
echo ""

npx prisma migrate deploy
ok "Database migrations applied"

# ── 4. Dry-run key encryption ─────────────────────────────────────────────────

log "Dry-run: checking keys to encrypt…"
echo ""
DRY_RUN=true npm run security:encrypt-keys --silent 2>&1 || true
echo ""

# ── 5. Confirm before encrypting ─────────────────────────────────────────────

warn "About to encrypt all plaintext RSA private keys in the database."
warn "This is irreversible without the PRIVATE_KEY_ENCRYPTION_KEY."
echo ""
read -r -p "  Proceed with encryption? [y/N] " CONFIRM
echo ""

if [[ "${CONFIRM,,}" != "y" ]]; then
  warn "Skipped key encryption. Run manually when ready:"
  echo "     npm run security:encrypt-keys"
  echo ""
  exit 0
fi

# ── 6. Encrypt RSA keys ───────────────────────────────────────────────────────

log "Encrypting RSA private keys (AES-256-GCM)…"
npm run security:encrypt-keys
ok "RSA keys encrypted successfully"

# ── 7. Summary ────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Security Upgrade Complete               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  ✅ Dependencies installed (cookie-parser added)"
echo "  ✅ Prisma migration applied (ticketId nullable)"
echo "  ✅ RSA private keys encrypted at rest (AES-256-GCM)"
echo ""
echo "  ⚠️  CRITICAL: Back up PRIVATE_KEY_ENCRYPTION_KEY"
echo "     Current value: ${PRIVATE_KEY_ENCRYPTION_KEY:0:8}...${PRIVATE_KEY_ENCRYPTION_KEY: -8}"
echo ""
echo "  Store it in your secret manager (AWS Secrets Manager,"
echo "  HashiCorp Vault, etc.) — losing it = losing all RSA keys."
echo ""
echo "  🚀 You can now (re)start the application."
echo ""
