#!/bin/bash
# =============================================================================
# Ticketing Platform - Production Deployment Script
# =============================================================================
# Usage: ./scripts/deploy.sh [--branch main] [--skip-backup] [--skip-migrate]
# =============================================================================
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/ticketing}"
LOG_FILE="/var/log/ticketing-deploy-$(date +%Y%m%d-%H%M%S).log"
DOCKER_COMPOSE_CMD="docker compose"

log_info()    { echo -e "${BLUE}[$(date '+%H:%M:%S')] [INFO]${NC} $1" | tee -a "$LOG_FILE"; }
log_success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] [SUCCESS]${NC} $1" | tee -a "$LOG_FILE"; }
log_warn()    { echo -e "${YELLOW}[$(date '+%H:%M:%S')] [WARN]${NC} $1" | tee -a "$LOG_FILE"; }
log_error()   { echo -e "${RED}[$(date '+%H:%M:%S')] [ERROR]${NC} $1" | tee -a "$LOG_FILE"; }

# Parse arguments
SKIP_BACKUP=false
SKIP_MIGRATE=false
SKIP_PULL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --branch) DEPLOY_BRANCH="$2"; shift 2;;
        --skip-backup) SKIP_BACKUP=true; shift;;
        --skip-migrate) SKIP_MIGRATE=true; shift;;
        --skip-pull) SKIP_PULL=true; shift;;
        *) log_warn "Unknown argument: $1"; shift;;
    esac
done

echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}  Ticketing Platform - Production Deploy${NC}"
echo -e "${CYAN}=============================================${NC}"
echo "  Branch: ${DEPLOY_BRANCH}"
echo "  Skip Backup: ${SKIP_BACKUP}"
echo "  Skip Migrate: ${SKIP_MIGRATE}"
echo "  Time: $(date)"
echo ""

# =============================================================================
# Pre-flight Checks
# =============================================================================
log_info "Running pre-flight checks..."

# Check we're in the right directory
if [ ! -f "${PROJECT_ROOT}/docker-compose.yml" ]; then
    log_error "docker-compose.yml not found. Run from project root."
    exit 1
fi

# Check .env exists
if [ ! -f "${PROJECT_ROOT}/.env" ]; then
    log_error ".env file not found. Copy .env.example and fill in production values."
    exit 1
fi

# Check critical env vars
source "${PROJECT_ROOT}/.env"
for var in JWT_SECRET JWT_REFRESH_SECRET POSTGRES_PASSWORD REDIS_PASSWORD; do
    if [ -z "${!var:-}" ]; then
        log_error "Required environment variable $var is not set in .env"
        exit 1
    fi
    if [[ "${!var}" == *"change-me"* ]] || [[ "${!var}" == *"your-"* ]]; then
        log_error "$var appears to still be a placeholder value. Update it for production!"
        exit 1
    fi
done

# Check Docker is running
if ! docker info &>/dev/null 2>&1; then
    log_error "Docker daemon is not running."
    exit 1
fi

# Check RSA keys exist
if [ ! -f "${PROJECT_ROOT}/keys/private.pem" ]; then
    log_error "RSA private key not found. Run: ./scripts/generate-keys.sh"
    exit 1
fi

log_success "Pre-flight checks passed"

# =============================================================================
# Step 1: Database Backup
# =============================================================================
if [ "$SKIP_BACKUP" = false ]; then
    log_info "Creating database backup..."
    mkdir -p "$BACKUP_DIR"

    BACKUP_FILE="${BACKUP_DIR}/ticketing_db_$(date +%Y%m%d_%H%M%S).sql.gz"

    if $DOCKER_COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml \
        exec -T postgres pg_dump -U "${POSTGRES_USER:-ticketing}" "${POSTGRES_DB:-ticketing_db}" \
        | gzip > "$BACKUP_FILE" 2>/dev/null; then
        log_success "Database backup saved: $BACKUP_FILE"
    else
        log_warn "Database backup failed - continuing anyway (service may not be running yet)"
    fi

    # Keep only last 10 backups
    ls -t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
    log_info "Keeping last 10 backups. Older ones pruned."
else
    log_warn "Skipping database backup (--skip-backup)"
fi

# =============================================================================
# Step 2: Pull Latest Code
# =============================================================================
if [ "$SKIP_PULL" = false ]; then
    log_info "Pulling latest code from branch: ${DEPLOY_BRANCH}..."
    cd "$PROJECT_ROOT"
    git fetch origin
    git checkout "$DEPLOY_BRANCH"
    git pull origin "$DEPLOY_BRANCH"
    log_success "Code updated to latest $(git rev-parse --short HEAD)"
else
    log_warn "Skipping git pull (--skip-pull)"
fi

# =============================================================================
# Step 3: Build Docker Images
# =============================================================================
log_info "Building Docker images..."
cd "$PROJECT_ROOT"

$DOCKER_COMPOSE_CMD \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    build --no-cache --parallel

log_success "Docker images built"

# =============================================================================
# Step 4: Rolling Update - Backend
# =============================================================================
log_info "Deploying backend..."

$DOCKER_COMPOSE_CMD \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    up -d --no-deps backend

# Wait for backend health check
log_info "Waiting for backend to be healthy..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:3001/api/v1/health &>/dev/null 2>&1; then
        log_success "Backend is healthy"
        break
    fi
    echo -n "."
    sleep 3
    if [ "$i" -eq 30 ]; then
        echo ""
        log_error "Backend health check failed after 90 seconds"
        log_error "Check logs: docker compose logs backend"
        exit 1
    fi
done

# =============================================================================
# Step 5: Run Database Migrations
# =============================================================================
if [ "$SKIP_MIGRATE" = false ]; then
    log_info "Running database migrations..."
    $DOCKER_COMPOSE_CMD \
        -f docker-compose.yml \
        -f docker-compose.prod.yml \
        exec -T backend npx prisma migrate deploy
    log_success "Migrations applied"
else
    log_warn "Skipping migrations (--skip-migrate)"
fi

# =============================================================================
# Step 6: Deploy Frontend
# =============================================================================
log_info "Deploying frontend..."

$DOCKER_COMPOSE_CMD \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    up -d --no-deps frontend

# Wait for frontend
log_info "Waiting for frontend to be healthy..."
for i in $(seq 1 20); do
    if curl -sf http://localhost:3000 &>/dev/null 2>&1; then
        log_success "Frontend is healthy"
        break
    fi
    echo -n "."
    sleep 3
    if [ "$i" -eq 20 ]; then
        echo ""
        log_warn "Frontend health check timed out - check logs"
    fi
done

# =============================================================================
# Step 7: Deploy/Reload Nginx
# =============================================================================
log_info "Deploying/reloading Nginx..."

# Test nginx config first
if $DOCKER_COMPOSE_CMD \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    exec -T nginx nginx -t 2>/dev/null; then
    # Reload nginx gracefully
    $DOCKER_COMPOSE_CMD \
        -f docker-compose.yml \
        -f docker-compose.prod.yml \
        exec -T nginx nginx -s reload 2>/dev/null || \
    $DOCKER_COMPOSE_CMD \
        -f docker-compose.yml \
        -f docker-compose.prod.yml \
        up -d --no-deps nginx
    log_success "Nginx deployed/reloaded"
else
    log_error "Nginx config test failed. Check docker/nginx/nginx.conf"
    exit 1
fi

# =============================================================================
# Step 8: Smoke Tests
# =============================================================================
log_info "Running smoke tests..."

TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local name="$1"
    local cmd="$2"
    if eval "$cmd" &>/dev/null 2>&1; then
        log_success "PASS: $name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "FAIL: $name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

run_test "Backend health endpoint" "curl -sf http://localhost:3001/api/v1/health"
run_test "Frontend homepage" "curl -sf http://localhost:3000"
run_test "Nginx HTTP redirect" "curl -sf -o /dev/null -w '%{http_code}' http://localhost:80 | grep -q 301"

echo ""
log_info "Smoke tests: ${TESTS_PASSED} passed, ${TESTS_FAILED} failed"

if [ "$TESTS_FAILED" -gt 0 ]; then
    log_warn "Some smoke tests failed. Review logs: docker compose logs"
fi

# =============================================================================
# Step 9: Clean Up Old Images
# =============================================================================
log_info "Cleaning up unused Docker images..."
docker image prune -f --filter "until=24h" 2>/dev/null || true

# =============================================================================
# Deploy Complete
# =============================================================================
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
echo "Time: $(date)"
echo "Log: $LOG_FILE"
echo ""
echo "Monitor with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo ""
