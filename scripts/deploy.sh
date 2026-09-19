#!/usr/bin/env bash
# =============================================================================
# ZAYA — Script de déploiement production
# =============================================================================
# Usage :
#   bash scripts/deploy.sh               → mise à jour normale
#   bash scripts/deploy.sh --first-run   → premier déploiement (SSL + seed)
#   bash scripts/deploy.sh --skip-backup → sans sauvegarde préalable
#   bash scripts/deploy.sh --skip-build  → sans rebuild des images
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE="docker compose -f ${PROJECT_ROOT}/docker-compose.yml -f ${PROJECT_ROOT}/docker-compose.prod.yml"
LOG_FILE="/var/log/zaya-deploy-$(date +%Y%m%d-%H%M%S).log"

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[$(date +%H:%M:%S)][INFO]${NC}    $1" | tee -a "$LOG_FILE"; }
log_success() { echo -e "${GREEN}[$(date +%H:%M:%S)][OK]${NC}      $1" | tee -a "$LOG_FILE"; }
log_warn()    { echo -e "${YELLOW}[$(date +%H:%M:%S)][WARN]${NC}    $1" | tee -a "$LOG_FILE"; }
log_error()   { echo -e "${RED}[$(date +%H:%M:%S)][ERROR]${NC}   $1" | tee -a "$LOG_FILE"; exit 1; }
log_section() { echo -e "\n${CYAN}══ $1${NC}" | tee -a "$LOG_FILE"; }

# ── Arguments ─────────────────────────────────────────────────────────────────
FIRST_RUN=false
SKIP_BACKUP=false
SKIP_BUILD=false
SKIP_MIGRATE=false

for arg in "$@"; do
  case $arg in
    --first-run)    FIRST_RUN=true ;;
    --skip-backup)  SKIP_BACKUP=true ;;
    --skip-build)   SKIP_BUILD=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    *) log_warn "Argument inconnu : $arg" ;;
  esac
done

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || LOG_FILE="/tmp/zaya-deploy-$(date +%Y%m%d-%H%M%S).log"

echo "" | tee -a "$LOG_FILE"
echo -e "${CYAN}╔═══════════════════════════════════════════════╗${NC}" | tee -a "$LOG_FILE"
echo -e "${CYAN}║        ZAYA — Déploiement production           ║${NC}" | tee -a "$LOG_FILE"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${NC}" | tee -a "$LOG_FILE"
echo "  Mode    : $([ "$FIRST_RUN" = true ] && echo 'PREMIER DÉPLOIEMENT' || echo 'Mise à jour')" | tee -a "$LOG_FILE"
echo "  Commit  : $(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'N/A')" | tee -a "$LOG_FILE"
echo "  Date    : $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# =============================================================================
# ÉTAPE 0 — Vérifications préalables
# =============================================================================
log_section "0. Vérifications préalables"

cd "$PROJECT_ROOT"

# Docker disponible
docker info &>/dev/null || log_error "Docker daemon non démarré."

# .env présent
[ -f "${PROJECT_ROOT}/.env" ] || log_error ".env introuvable. Lance : bash scripts/generate-prod-secrets.sh >> .env"

# Charger les variables d'env
set -a; source "${PROJECT_ROOT}/.env"; set +a

# Variables critiques obligatoires
REQUIRED_VARS=(
  JWT_SECRET JWT_REFRESH_SECRET
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  REDIS_PASSWORD
  PRIVATE_KEY_ENCRYPTION_KEY
  ACCREDITATION_HMAC_SECRET
  FLEXPAY_TOKEN
  FRONTEND_URL APP_BASE_URL
)
MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    log_warn "Variable manquante : ${var}"
    MISSING=$((MISSING + 1))
  elif echo "$val" | grep -qiE "(change.me|placeholder|your-|generate-with|<)"; then
    log_warn "Variable non configurée (valeur par défaut) : ${var}"
    MISSING=$((MISSING + 1))
  fi
done
[ "$MISSING" -gt 0 ] && log_error "${MISSING} variable(s) manquante(s) ou non configurée(s) dans .env"

# Entropie minimale des secrets critiques (>= 20 caractères)
for var in JWT_SECRET JWT_REFRESH_SECRET PRIVATE_KEY_ENCRYPTION_KEY ACCREDITATION_HMAC_SECRET; do
  val="${!var}"
  [ "${#val}" -ge 20 ] || log_error "${var} trop court (${#val} chars < 20). Régénère avec openssl rand -hex 32"
done

# Vérifier que JWT_SECRET ≠ ACCREDITATION_HMAC_SECRET (isolation des secrets)
[ "${JWT_SECRET}" != "${ACCREDITATION_HMAC_SECRET}" ] \
  || log_error "JWT_SECRET et ACCREDITATION_HMAC_SECRET sont identiques — ils doivent être différents"

log_success "Toutes les vérifications préalables sont OK"

# =============================================================================
# ÉTAPE 1 — Sauvegarde de la base (sauf premier déploiement)
# =============================================================================
log_section "1. Sauvegarde de la base de données"

if [ "$SKIP_BACKUP" = true ] || [ "$FIRST_RUN" = true ]; then
  log_warn "Sauvegarde ignorée (${FIRST_RUN} && first-run || --skip-backup)"
else
  BACKUP_DIR="/opt/zaya/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="${BACKUP_DIR}/pre-deploy-$(date +%Y%m%d_%H%M%S).sql.gz"

  if $COMPOSE exec -T postgres \
      pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" 2>/dev/null \
      | gzip > "$BACKUP_FILE"; then
    log_success "Sauvegarde : ${BACKUP_FILE} ($(du -sh "$BACKUP_FILE" | cut -f1))"
  else
    log_warn "Sauvegarde échouée (service peut-être pas encore démarré)"
    rm -f "$BACKUP_FILE"
  fi

  # Garder les 10 dernières
  ls -t "${BACKUP_DIR}"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f || true
fi

# =============================================================================
# ÉTAPE 2 — SSL / Let's Encrypt (premier déploiement uniquement)
# =============================================================================
if [ "$FIRST_RUN" = true ]; then
  log_section "2. Certificat SSL Let's Encrypt"

  DOMAIN="${APP_BASE_URL#https://}"
  DOMAIN="${DOMAIN#http://}"
  DOMAIN="${DOMAIN%%/*}"
  EMAIL="${SMTP_USER:-contact@${DOMAIN}}"

  if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    log_warn "Certificat SSL existant pour ${DOMAIN} — ignoré"
  else
    log_info "Demande du certificat pour ${DOMAIN} (email : ${EMAIL})"

    # Démarrer un nginx minimal pour la vérification ACME
    $COMPOSE up -d nginx 2>/dev/null || true
    sleep 3

    certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      --email "${EMAIL}" \
      --agree-tos \
      --no-eff-email \
      -d "${DOMAIN}" \
      -d "www.${DOMAIN}" 2>/dev/null \
    || certbot certonly \
      --standalone \
      --email "${EMAIL}" \
      --agree-tos \
      --no-eff-email \
      -d "${DOMAIN}" \
      --preferred-challenges http

    log_success "Certificat SSL obtenu pour ${DOMAIN}"

    # Renouvellement automatique via cron
    if ! crontab -l 2>/dev/null | grep -q certbot; then
      (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f /opt/zaya/ticketing-platform/docker-compose.yml -f /opt/zaya/ticketing-platform/docker-compose.prod.yml exec nginx nginx -s reload") | crontab -
      log_success "Renouvellement automatique SSL configuré (cron 03:00 quotidien)"
    fi
  fi
else
  log_section "2. SSL"
  log_info "Mise à jour normale — SSL ignoré (déjà configuré)"
fi

# =============================================================================
# ÉTAPE 3 — Récupération du code
# =============================================================================
log_section "3. Récupération du code (git pull)"
git fetch origin
git checkout main
git pull origin main
log_success "Code à jour : $(git rev-parse --short HEAD)"

# =============================================================================
# ÉTAPE 4 — Construction des images Docker
# =============================================================================
log_section "4. Construction des images Docker"

if [ "$SKIP_BUILD" = true ]; then
  log_warn "Build ignoré (--skip-build)"
else
  $COMPOSE build --parallel
  log_success "Images construites"
fi

# =============================================================================
# ÉTAPE 5 — Démarrage des services infrastructure
# =============================================================================
log_section "5. Démarrage des services (postgres, redis, nginx)"
$COMPOSE up -d postgres redis nginx uptime-kuma postgres-backup

# Attendre PostgreSQL
log_info "Attente de PostgreSQL..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" &>/dev/null; then
    log_success "PostgreSQL prêt"
    break
  fi
  [ "$i" -eq 30 ] && log_error "PostgreSQL n'a pas démarré dans le délai imparti"
  sleep 2
done

# Attendre Redis
log_info "Attente de Redis..."
for i in $(seq 1 15); do
  if $COMPOSE exec -T redis redis-cli --no-auth-warning -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -q PONG; then
    log_success "Redis prêt"
    break
  fi
  [ "$i" -eq 15 ] && log_warn "Redis timeout — on continue quand même"
  sleep 2
done

# =============================================================================
# ÉTAPE 6 — Migrations Prisma
# =============================================================================
log_section "6. Migrations de la base de données"

if [ "$SKIP_MIGRATE" = true ]; then
  log_warn "Migrations ignorées (--skip-migrate)"
else
  # Démarrer le backend brièvement pour les migrations
  $COMPOSE up -d backend
  sleep 10

  $COMPOSE exec -T backend npx prisma migrate deploy \
    && log_success "Migrations appliquées" \
    || log_error "Échec des migrations. Vérifier : $COMPOSE logs backend"
fi

# =============================================================================
# ÉTAPE 7 — Migration DEK (PRIVATE_KEY_ENCRYPTION_KEY v1 → v2)
# =============================================================================
log_section "7. Vérification du chiffrement AES des clés privées"

DEK_STATUS=$($COMPOSE exec -T backend \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.keyPair.count({ where: { privateKey: { not: { startsWith: 'v2:' } } } })
      .then(n => { console.log(n); process.exit(0); })
      .catch(() => { console.log(-1); process.exit(0); });
  " 2>/dev/null || echo "-1")

if [ "$DEK_STATUS" = "-1" ]; then
  log_warn "Vérification DEK ignorée (backend pas encore prêt)"
elif [ "$DEK_STATUS" -gt 0 ]; then
  log_warn "${DEK_STATUS} KeyPair(s) en format v1 (sel statique) — migration recommandée"
  log_warn "Lance : OLD_DEK=<ancien_dek> NEW_DEK=<nouveau_dek> npm run security:rotate-dek"
else
  log_success "Toutes les clés privées sont au format v2 (sel aléatoire par enregistrement)"
fi

# =============================================================================
# ÉTAPE 8 — Seed initial (premier déploiement uniquement)
# =============================================================================
if [ "$FIRST_RUN" = true ]; then
  log_section "8. Seed initial de la base de données"

  if $COMPOSE exec -T backend npx prisma db seed 2>/dev/null; then
    log_success "Base de données initialisée avec les données de départ"
  else
    log_warn "Seed ignoré (peut-être déjà fait ou aucun seedeur configuré)"
  fi
else
  log_section "8. Seed"
  log_info "Mise à jour normale — seed ignoré"
fi

# =============================================================================
# ÉTAPE 9 — Déploiement complet
# =============================================================================
log_section "9. Déploiement complet de tous les services"
$COMPOSE up -d

# Attendre backend
log_info "Attente du backend..."
for i in $(seq 1 40); do
  if curl -sf http://localhost:3001/api/v1/health &>/dev/null; then
    log_success "Backend opérationnel"
    break
  fi
  [ "$i" -eq 40 ] && log_error "Backend non disponible après 120s. Logs : $COMPOSE logs backend"
  sleep 3
done

# Attendre frontend
log_info "Attente du frontend..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000 &>/dev/null; then
    log_success "Frontend opérationnel"
    break
  fi
  [ "$i" -eq 20 ] && log_warn "Frontend timeout (vérifier : $COMPOSE logs frontend)"
  sleep 3
done

# =============================================================================
# ÉTAPE 10 — Tests de smoke
# =============================================================================
log_section "10. Tests de smoke"

PASS=0; FAIL=0
check() {
  local label="$1"; local cmd="$2"
  if eval "$cmd" &>/dev/null 2>&1; then
    log_success "PASS : ${label}"; PASS=$((PASS+1))
  else
    log_warn  "FAIL : ${label}"; FAIL=$((FAIL+1))
  fi
}

check "Backend health"             "curl -sf http://localhost:3001/api/v1/health"
check "Frontend homepage"          "curl -sf http://localhost:3000"
check "HTTPS redirect (80→443)"    "curl -sf -o /dev/null -w '%{http_code}' http://localhost | grep -q '301\|302'"
check "Auth endpoint accessible"   "curl -sf -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/auth/login | grep -q '400\|405'"
check "PostgreSQL actif"           "$COMPOSE exec -T postgres pg_isready -U ${POSTGRES_USER}"
check "Redis actif"                "$COMPOSE exec -T redis redis-cli --no-auth-warning -a ${REDIS_PASSWORD} ping"

echo ""
log_info "Smoke tests : ${PASS} réussis, ${FAIL} échoués"
[ "$FAIL" -gt 0 ] && log_warn "Des tests ont échoué — vérifier les logs : $COMPOSE logs"

# =============================================================================
# ÉTAPE 11 — Nettoyage images Docker
# =============================================================================
log_section "11. Nettoyage"
docker image prune -f --filter "until=24h" 2>/dev/null || true
log_success "Images anciennes supprimées"

# =============================================================================
# Résumé
# =============================================================================
echo "" | tee -a "$LOG_FILE"
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}" | tee -a "$LOG_FILE"
echo -e "${GREEN}║         Déploiement terminé avec succès !         ║${NC}" | tee -a "$LOG_FILE"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

DOMAIN="${APP_BASE_URL#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%%/*}"
echo "  Plateforme  : https://${DOMAIN}" | tee -a "$LOG_FILE"
echo "  API         : https://${DOMAIN}/api/v1/health" | tee -a "$LOG_FILE"
echo "  Monitoring  : http://<IP_VPS>:3001 (Uptime Kuma — config au premier boot)" | tee -a "$LOG_FILE"
echo "  Log         : ${LOG_FILE}" | tee -a "$LOG_FILE"
echo "  Commit      : $(git rev-parse --short HEAD 2>/dev/null || echo 'N/A')" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [ "$FIRST_RUN" = true ]; then
  echo -e "${YELLOW}  Actions post-déploiement (premier lancement) :${NC}" | tee -a "$LOG_FILE"
  echo "  1. Uptime Kuma : ouvrir http://<IP_VPS>:3001 → créer compte admin" | tee -a "$LOG_FILE"
  echo "     Ajouter monitors : https://${DOMAIN}/api/v1/health et https://${DOMAIN}" | tee -a "$LOG_FILE"
  echo "  2. Migration DEK si des clés v1 existent :" | tee -a "$LOG_FILE"
  echo "     OLD_DEK=<ancien> NEW_DEK=\$(openssl rand -hex 32) npm run security:rotate-dek" | tee -a "$LOG_FILE"
  echo "  3. Fermer le port 3001 (Uptime Kuma) depuis le panel VPS après la config" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
fi
