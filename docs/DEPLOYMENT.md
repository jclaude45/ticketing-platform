# Ticketing Platform - Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment on Ubuntu VPS](#production-deployment-on-ubuntu-vps)
4. [SSL Setup with Let's Encrypt](#ssl-setup-with-lets-encrypt)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Backup Procedures](#backup-procedures)
7. [Monitoring Setup](#monitoring-setup)

---

## Prerequisites

### Local Development
- Docker Desktop 4.x+ (includes Docker Compose v2)
- Node.js 20+ (for running outside Docker)
- Git
- OpenSSL (for key generation)

### Production Server
- Ubuntu 22.04 LTS (recommended)
- Minimum: 2 vCPU, 4GB RAM, 40GB SSD
- Recommended: 4 vCPU, 8GB RAM, 80GB SSD
- Domain name with DNS pointing to server IP
- Ports 80 and 443 open in firewall

---

## Local Development Setup

### 1. Clone the repository
```bash
git clone https://github.com/your-org/ticketing-platform.git
cd ticketing-platform
```

### 2. Run the setup script
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The setup script will:
- Check all dependencies
- Copy `.env.example` to `.env`
- Generate RSA-4096 keys
- Start Docker services
- Run database migrations
- Seed initial data

### 3. Access the application
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/v1
- Swagger Docs: http://localhost:3001/api/v1/docs

### Manual Setup (if script fails)

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your values
nano .env

# Generate RSA keys
./scripts/generate-keys.sh

# Start services
docker compose up -d --build

# Wait for postgres to be ready (~10 seconds), then:
docker compose exec backend npx prisma migrate dev
docker compose exec backend npx prisma db seed
```

### Development Commands
```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend

# Restart a service
docker compose restart backend

# Open Prisma Studio (database browser)
docker compose exec backend npx prisma studio

# Run backend tests
docker compose exec backend npm test

# Access postgres directly
docker compose exec postgres psql -U ticketing -d ticketing_db

# Access redis CLI
docker compose exec redis redis-cli -a redis_secret
```

---

## Production Deployment on Ubuntu VPS

### Step 1: Server Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
    curl \
    git \
    openssl \
    ufw \
    fail2ban \
    unattended-upgrades

# Configure automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Step 2: Configure Firewall

```bash
# Configure UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### Step 3: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo bash

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### Step 4: Create Application User

```bash
# Create dedicated user for the application
sudo useradd -m -s /bin/bash ticketing
sudo usermod -aG docker ticketing

# Switch to application user
sudo su - ticketing
```

### Step 5: Clone and Configure

```bash
# Clone repository (as ticketing user)
cd /opt
sudo git clone https://github.com/your-org/ticketing-platform.git
sudo chown -R ticketing:ticketing ticketing-platform
cd ticketing-platform

# Copy and edit environment file
cp .env.example .env
nano .env
```

Critical production values to set in `.env`:
```bash
# Strong random secrets (generate with: openssl rand -base64 64)
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
POSTGRES_PASSWORD=<strong-random-password>
REDIS_PASSWORD=<strong-random-password>

# Your actual domain
DOMAIN=yourdomain.com
FRONTEND_URL=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
NEXT_PUBLIC_WS_URL=wss://yourdomain.com

# Production mode
NODE_ENV=production
```

### Step 6: Generate RSA Keys

```bash
./scripts/generate-keys.sh
```

### Step 7: First Deployment (before SSL)

For the first deployment, temporarily configure Nginx for HTTP only to allow Let's Encrypt verification. Edit `docker/nginx/nginx.conf` to remove SSL directives, then:

```bash
# Build and start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check all services are healthy
docker compose ps

# Run migrations
docker compose exec backend npx prisma migrate deploy

# Seed initial admin user
docker compose exec backend npx prisma db seed
```

---

## SSL Setup with Let's Encrypt

### Step 1: Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Step 2: Obtain Certificate

Ensure the platform is running on port 80 (HTTP only initially):

```bash
sudo certbot certonly \
    --webroot \
    -w /opt/ticketing-platform/docker/nginx/ssl \
    -d yourdomain.com \
    -d www.yourdomain.com \
    --email your@email.com \
    --agree-tos \
    --no-eff-email
```

Or if using the Docker certbot service from `docker-compose.prod.yml`, the webroot path inside the container is `/var/www/certbot`.

### Step 3: Copy Certificates to Nginx SSL Directory

```bash
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem \
    /opt/ticketing-platform/docker/nginx/ssl/fullchain.pem

sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem \
    /opt/ticketing-platform/docker/nginx/ssl/privkey.pem

sudo cp /etc/letsencrypt/live/yourdomain.com/chain.pem \
    /opt/ticketing-platform/docker/nginx/ssl/chain.pem

# Fix permissions
sudo chmod 644 /opt/ticketing-platform/docker/nginx/ssl/fullchain.pem
sudo chmod 644 /opt/ticketing-platform/docker/nginx/ssl/chain.pem
sudo chmod 600 /opt/ticketing-platform/docker/nginx/ssl/privkey.pem
sudo chown -R ticketing:ticketing /opt/ticketing-platform/docker/nginx/ssl/
```

### Step 4: Enable HTTPS in Nginx Config

Update `docker/nginx/nginx.conf` to use the SSL configuration (uncomment SSL server block, ensure paths match).

Then reload Nginx:
```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

### Step 5: Set Up Certificate Auto-Renewal

```bash
# Add to crontab (certbot auto-renews when < 30 days remain)
sudo crontab -e

# Add this line:
0 3 * * * certbot renew --quiet && \
    cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/ticketing-platform/docker/nginx/ssl/ && \
    cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/ticketing-platform/docker/nginx/ssl/ && \
    cp /etc/letsencrypt/live/yourdomain.com/chain.pem /opt/ticketing-platform/docker/nginx/ssl/ && \
    docker compose -C /opt/ticketing-platform exec nginx nginx -s reload
```

### Step 6: Full Production Start with SSL

```bash
cd /opt/ticketing-platform
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://user:pass@postgres:5432/db` |
| `POSTGRES_USER` | PostgreSQL username | Yes | `ticketing` |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes | `strong-random-pass` |
| `POSTGRES_DB` | PostgreSQL database name | Yes | `ticketing_db` |
| `REDIS_PASSWORD` | Redis auth password | Yes | `strong-random-pass` |
| `REDIS_URL` | Redis connection URL | Yes | `redis://:pass@redis:6379` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Yes | `$(openssl rand -base64 64)` |
| `JWT_REFRESH_SECRET` | JWT refresh signing secret | Yes | `$(openssl rand -base64 64)` |
| `JWT_EXPIRES_IN` | Access token lifetime | No | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | No | `7d` |
| `NODE_ENV` | Node environment | Yes | `production` |
| `PORT` | Backend server port | No | `3001` |
| `FRONTEND_URL` | Frontend URL (for CORS) | Yes | `https://yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | Yes | `https://yourdomain.com/api/v1` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for frontend | Yes | `wss://yourdomain.com` |
| `DOMAIN` | Your domain (for Nginx) | Yes (prod) | `yourdomain.com` |
| `SMTP_HOST` | SMTP server hostname | Yes | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | Yes | `587` |
| `SMTP_USER` | SMTP username/email | Yes | `your@gmail.com` |
| `SMTP_PASS` | SMTP password/app password | Yes | `gmail-app-password` |
| `EMAIL_FROM` | From address for emails | Yes | `noreply@yourdomain.com` |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Yes* | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret | Yes* | `wJal...` |
| `AWS_REGION` | AWS region | Yes* | `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name | Yes* | `ticketing-platform` |
| `TWO_FACTOR_AUTHENTICATION_APP_NAME` | TOTP app name | No | `TicketPlatform` |
| `THROTTLE_TTL` | Rate limit window (seconds) | No | `60` |
| `THROTTLE_LIMIT` | Max requests per window | No | `100` |

*Required if using S3 for file storage

---

## Backup Procedures

### Automated Database Backup

Create `/opt/ticketing-platform/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/ticketing"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ticketing_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Create backup
docker compose -C /opt/ticketing-platform exec -T postgres \
    pg_dump -U ticketing ticketing_db | gzip > "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE ($(du -h $BACKUP_FILE | cut -f1))"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Cleanup complete. Current backups:"
ls -lh "$BACKUP_DIR"
```

```bash
chmod +x /opt/ticketing-platform/scripts/backup.sh

# Schedule daily backups at 2 AM
crontab -e
# Add: 0 2 * * * /opt/ticketing-platform/scripts/backup.sh >> /var/log/ticketing-backup.log 2>&1
```

### Restore from Backup

```bash
# Stop backend to prevent writes during restore
docker compose stop backend

# Restore backup
gunzip -c /opt/backups/ticketing/ticketing_YYYYMMDD_HHMMSS.sql.gz | \
    docker compose exec -T postgres psql -U ticketing ticketing_db

# Restart backend
docker compose start backend
```

### Backup RSA Keys

```bash
# The RSA keys are critical - back them up securely!
# Store in encrypted form in a separate location

# Encrypt private key before backup
openssl enc -aes-256-cbc -pbkdf2 -in ./keys/private.pem \
    -out /secure/backup/private.pem.enc

# To restore:
openssl enc -d -aes-256-cbc -pbkdf2 -in /secure/backup/private.pem.enc \
    -out ./keys/private.pem
```

---

## Monitoring Setup

### Health Check Endpoints

| Endpoint | Expected Response |
|----------|-------------------|
| `GET /api/v1/health` | `{ "status": "ok", "db": "connected", "redis": "connected" }` |
| `GET /health` (Nginx) | `healthy` |
| `GET http://localhost:3000` | 200 OK |

### Docker Health Status

```bash
# Check all container health statuses
docker compose ps

# Watch health checks
watch -n 5 'docker compose ps'
```

### Log Monitoring

```bash
# View real-time logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Filter by service
docker compose logs -f backend
docker compose logs -f nginx

# Check error logs
docker compose logs backend | grep -i error
docker compose logs nginx | grep -i "5[0-9][0-9]"
```

### Uptime Monitoring (Optional)

Use a free uptime monitoring service:
- **UptimeRobot** (free): https://uptimerobot.com
- **BetterUptime**: https://betteruptime.com

Configure monitors for:
1. `https://yourdomain.com/api/v1/health` (backend health)
2. `https://yourdomain.com` (frontend)

### Resource Monitoring with cAdvisor + Prometheus (Optional)

Add to `docker-compose.prod.yml`:
```yaml
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: ticketing_cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"
    networks:
      - ticketing_network
```

### Application Performance (Optional)

Consider integrating Sentry for error tracking:
```bash
# Add to .env
SENTRY_DSN=https://xxxxx@oXXXXX.ingest.sentry.io/XXXXXX
```

### Disk Space Monitoring

```bash
# Add to crontab
*/30 * * * * df -h / | awk 'NR==2{if(int($5)>80) print "WARNING: Disk " $5 " full on " HOSTNAME}' | mail -s "Disk Alert" admin@yourdomain.com
```
