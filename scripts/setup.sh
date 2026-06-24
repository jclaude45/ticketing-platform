#!/bin/bash
# =============================================================================
# Ticketing Platform - Development Setup Script
# =============================================================================
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "==========================================="
echo "  Ticketing Platform - Setup Script"
echo "==========================================="
echo ""

# =============================================================================
# Step 1: Check Dependencies
# =============================================================================
log_info "Checking dependencies..."

check_command() {
    local cmd="$1"
    local install_hint="$2"
    if ! command -v "$cmd" &> /dev/null; then
        log_error "$cmd is not installed. $install_hint"
        return 1
    fi
    log_success "$cmd found: $(command -v "$cmd")"
}

MISSING_DEPS=0

# Check Docker
if ! check_command "docker" "Install from https://docs.docker.com/get-docker/"; then
    MISSING_DEPS=1
fi

# Check Docker Compose
if ! check_command "docker-compose" "Install from https://docs.docker.com/compose/install/ (or use Docker Desktop)"; then
    # Check for docker compose (v2)
    if docker compose version &>/dev/null 2>&1; then
        log_success "docker compose (v2) available"
        DOCKER_COMPOSE="docker compose"
    else
        MISSING_DEPS=1
    fi
else
    DOCKER_COMPOSE="docker-compose"
fi

# Check Node.js
if ! check_command "node" "Install from https://nodejs.org/ (v20+ required)"; then
    MISSING_DEPS=1
else
    NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js v20+ required, found v$(node --version)"
        MISSING_DEPS=1
    fi
fi

# Check npm
check_command "npm" "Install Node.js from https://nodejs.org/" || MISSING_DEPS=1

# Check OpenSSL (for key generation)
if ! check_command "openssl" "Install OpenSSL: brew install openssl (macOS) or apt install openssl (Ubuntu)"; then
    log_warn "OpenSSL not found - RSA key generation will be skipped"
fi

# Check Flutter (optional)
if command -v flutter &> /dev/null; then
    log_success "flutter found: $(flutter --version | head -1)"
else
    log_warn "flutter not found - Mobile app setup will be skipped (optional)"
fi

if [ "$MISSING_DEPS" -eq 1 ]; then
    log_error "Missing required dependencies. Please install them and re-run this script."
    exit 1
fi

echo ""
log_success "All required dependencies found!"
echo ""

# =============================================================================
# Step 2: Copy Environment Files
# =============================================================================
log_info "Setting up environment files..."

cd "$PROJECT_ROOT"

if [ ! -f ".env" ]; then
    cp .env.example .env
    log_success "Created .env from .env.example"
    log_warn "IMPORTANT: Edit .env and fill in your secrets before running in production!"
else
    log_warn ".env already exists - skipping (delete it to reset)"
fi

# =============================================================================
# Step 3: Generate RSA Keys
# =============================================================================
log_info "Generating RSA-4096 keys for QR ticket signing..."

mkdir -p "${PROJECT_ROOT}/keys"

if [ ! -f "${PROJECT_ROOT}/keys/private.pem" ]; then
    if command -v openssl &> /dev/null; then
        bash "${SCRIPT_DIR}/generate-keys.sh"
        log_success "RSA keys generated in ./keys/"
    else
        log_warn "OpenSSL not found - skipping key generation"
        log_warn "Run ./scripts/generate-keys.sh manually after installing OpenSSL"
    fi
else
    log_warn "RSA keys already exist in ./keys/ - skipping"
fi

# =============================================================================
# Step 4: Install Node Dependencies (optional, for local dev without Docker)
# =============================================================================
read -p "$(echo -e "${YELLOW}Install Node.js dependencies locally? (y/N): ${NC}")" -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Installing backend dependencies..."
    if [ -d "${PROJECT_ROOT}/backend" ] && [ -f "${PROJECT_ROOT}/backend/package.json" ]; then
        cd "${PROJECT_ROOT}/backend" && npm install
        log_success "Backend dependencies installed"
    else
        log_warn "backend/package.json not found - skipping"
    fi

    log_info "Installing frontend dependencies..."
    if [ -d "${PROJECT_ROOT}/frontend" ] && [ -f "${PROJECT_ROOT}/frontend/package.json" ]; then
        cd "${PROJECT_ROOT}/frontend" && npm install
        log_success "Frontend dependencies installed"
    else
        log_warn "frontend/package.json not found - skipping"
    fi
fi

# =============================================================================
# Step 5: Start Docker Services
# =============================================================================
cd "$PROJECT_ROOT"

log_info "Starting Docker services..."
$DOCKER_COMPOSE up -d --build

log_info "Waiting for services to be healthy..."

# Wait for PostgreSQL
echo -n "  Waiting for PostgreSQL"
for i in $(seq 1 30); do
    if $DOCKER_COMPOSE exec -T postgres pg_isready -U ticketing &>/dev/null 2>&1; then
        echo ""
        log_success "PostgreSQL is ready"
        break
    fi
    echo -n "."
    sleep 2
    if [ "$i" -eq 30 ]; then
        echo ""
        log_error "PostgreSQL did not become ready in time"
        exit 1
    fi
done

# Wait for Redis
echo -n "  Waiting for Redis"
for i in $(seq 1 15); do
    if $DOCKER_COMPOSE exec -T redis redis-cli ping &>/dev/null 2>&1; then
        echo ""
        log_success "Redis is ready"
        break
    fi
    echo -n "."
    sleep 2
    if [ "$i" -eq 15 ]; then
        echo ""
        log_warn "Redis did not respond - continuing anyway"
    fi
done

# Wait for Backend
echo -n "  Waiting for Backend API"
for i in $(seq 1 30); do
    if curl -s http://localhost:3001/api/v1/health &>/dev/null 2>&1; then
        echo ""
        log_success "Backend API is ready"
        break
    fi
    echo -n "."
    sleep 3
    if [ "$i" -eq 30 ]; then
        echo ""
        log_warn "Backend did not respond to health check - it may still be starting"
    fi
done

# =============================================================================
# Step 6: Run Database Migrations
# =============================================================================
log_info "Running database migrations..."

if $DOCKER_COMPOSE exec -T backend npx prisma migrate deploy 2>/dev/null; then
    log_success "Database migrations applied"
else
    log_warn "Could not run migrations automatically."
    log_warn "Run manually: docker-compose exec backend npx prisma migrate deploy"
fi

# =============================================================================
# Step 7: Seed Initial Data
# =============================================================================
log_info "Seeding initial data..."

if $DOCKER_COMPOSE exec -T backend npx prisma db seed 2>/dev/null; then
    log_success "Database seeded with initial data"
else
    log_warn "Could not seed database automatically."
    log_warn "Run manually: docker-compose exec backend npx prisma db seed"
fi

# =============================================================================
# Step 8: Flutter Mobile App (Optional)
# =============================================================================
if command -v flutter &> /dev/null; then
    read -p "$(echo -e "${YELLOW}Set up Flutter mobile app? (y/N): ${NC}")" -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -d "${PROJECT_ROOT}/mobile" ]; then
            log_info "Setting up Flutter mobile app..."
            cd "${PROJECT_ROOT}/mobile"
            flutter pub get
            log_success "Flutter dependencies installed"
        else
            log_warn "mobile/ directory not found - skipping Flutter setup"
        fi
    fi
fi

# =============================================================================
# Done!
# =============================================================================
echo ""
echo "==========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "==========================================="
echo ""
echo "Services running at:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:3001/api/v1"
echo "  API Docs:  http://localhost:3001/api/v1/docs"
echo "  Postgres:  localhost:5432"
echo "  Redis:     localhost:6379"
echo ""
echo "Useful commands:"
echo "  View logs:         docker-compose logs -f"
echo "  Stop services:     docker-compose down"
echo "  Rebuild backend:   docker-compose up -d --build backend"
echo "  Run migrations:    docker-compose exec backend npx prisma migrate dev"
echo "  Open Prisma Studio: docker-compose exec backend npx prisma studio"
echo ""
echo -e "${YELLOW}Remember to edit .env with your secrets!${NC}"
echo ""
