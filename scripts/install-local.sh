#!/usr/bin/env bash
# =============================================================================
# install-local.sh — Installation complète de l'environnement local (macOS ARM)
# Installe Homebrew → PostgreSQL → Redis → lance les services → migrations
#
# Usage (dans un Terminal, pas dans Claude Code) :
#   chmod +x scripts/install-local.sh
#   ./scripts/install-local.sh
# =============================================================================

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${CYAN}►${NC} $*"; }
ok()   { echo -e "${GREEN}✅${NC} $*"; }
warn() { echo -e "${YELLOW}⚠️ ${NC} $*"; }
fail() { echo -e "${RED}❌${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║     Ticketing Platform — Installation locale macOS    ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Homebrew ───────────────────────────────────────────────────────────────

if ! command -v brew &>/dev/null; then
  log "Installation de Homebrew (mot de passe requis)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Ajouter brew au PATH pour ce shell (macOS ARM / Apple Silicon)
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  fi
  ok "Homebrew installé"
else
  ok "Homebrew déjà installé : $(brew --version | head -1)"
fi

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────

if ! command -v psql &>/dev/null; then
  log "Installation de PostgreSQL 16..."
  brew install postgresql@16
  brew link postgresql@16 --force

  # Ajouter psql au PATH
  PG_BIN="$(brew --prefix postgresql@16)/bin"
  export PATH="$PG_BIN:$PATH"
  echo "export PATH=\"$PG_BIN:\$PATH\"" >> ~/.zprofile
  ok "PostgreSQL 16 installé"
else
  ok "PostgreSQL déjà installé : $(psql --version)"
fi

# ── 3. Redis ─────────────────────────────────────────────────────────────────

if ! command -v redis-server &>/dev/null; then
  log "Installation de Redis..."
  brew install redis
  ok "Redis installé"
else
  ok "Redis déjà installé : $(redis-server --version)"
fi

# ── 4. Démarrage des services ─────────────────────────────────────────────────

log "Démarrage de PostgreSQL..."
brew services start postgresql@16
sleep 3

log "Démarrage de Redis..."
brew services start redis
sleep 2

# Attendre que PostgreSQL soit prêt
echo -n "   Attente PostgreSQL"
for i in $(seq 1 20); do
  pg_isready -q 2>/dev/null && break
  echo -n "."
  sleep 1
done
echo ""
pg_isready -q 2>/dev/null && ok "PostgreSQL opérationnel" || fail "PostgreSQL ne répond pas"

# Attendre Redis
redis-cli ping 2>/dev/null | grep -q PONG && ok "Redis opérationnel" || fail "Redis ne répond pas"

# ── 5. Création de la base de données ─────────────────────────────────────────

log "Création de la base de données ticketing_db..."
createdb ticketing_db 2>/dev/null && ok "Base ticketing_db créée" || warn "La base existe déjà"

# Mettre à jour DATABASE_URL dans .env avec l'utilisateur système
CURRENT_USER=$(whoami)
if [[ -f "$BACKEND_DIR/.env" ]]; then
  sed -i '' "s|postgresql://postgres:password@localhost:5432/ticketing_db|postgresql://$CURRENT_USER@localhost:5432/ticketing_db|g" \
    "$BACKEND_DIR/.env"
  ok "DATABASE_URL mis à jour dans .env (utilisateur: $CURRENT_USER)"
fi

# ── 6. Backend — dépendances ──────────────────────────────────────────────────

log "Installation des dépendances backend..."
cd "$BACKEND_DIR"
npm ci --silent
ok "Dépendances backend installées"

# ── 7. Prisma generate + migrate ──────────────────────────────────────────────

log "Génération du client Prisma..."
npx prisma generate

log "Application des migrations..."
npx prisma migrate deploy
ok "Migrations appliquées"

log "Re-chiffrement des clés RSA existantes (le cas échéant)..."
DRY_RUN=true npm run security:encrypt-keys 2>&1 | grep -E "Plaintext|encrypted|Nothing" || true
warn "Si des clés PEM en clair sont détectées, lance :"
warn "  cd backend && npm run security:encrypt-keys"

# ── 8. Frontend — dépendances ─────────────────────────────────────────────────

log "Installation des dépendances frontend..."
cd "$FRONTEND_DIR"
npm ci --silent
ok "Dépendances frontend installées"

# ── 9. Lancement ──────────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║          Installation terminée — Lancement            ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "Lance le backend dans un terminal :"
echo "  cd $BACKEND_DIR && npm run start:dev"
echo ""
echo "Lance le frontend dans un autre terminal :"
echo "  cd $FRONTEND_DIR && npm run dev"
echo ""
echo "  Frontend  →  http://localhost:3000"
echo "  Backend   →  http://localhost:3001/api/v1"
echo "  API docs  →  http://localhost:3001/api/v1/docs"
echo ""
warn "Rappel : sauvegarde PRIVATE_KEY_ENCRYPTION_KEY dans un gestionnaire de secrets !"
echo ""
