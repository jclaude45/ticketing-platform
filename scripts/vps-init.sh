#!/usr/bin/env bash
# =============================================================================
# ZAYA — VPS Initialization Script
# Run ONCE as root on a fresh Ubuntu 22.04 / 24.04 VPS.
#
# What this does:
#   1. System update + essential packages
#   2. Docker CE + Docker Compose plugin
#   3. Non-root deploy user (zaya) added to docker group
#   4. UFW firewall (allow SSH + 80 + 443 only)
#   5. fail2ban (SSH brute-force + nginx 429 banning)
#   6. SSH hardening (PermitRootLogin no, PasswordAuthentication no)
#   7. gitleaks for pre-commit secret scanning
#   8. App directory at /opt/zaya
#   9. Certbot (Let's Encrypt) for SSL
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../vps-init.sh | bash
#   — or —
#   bash scripts/vps-init.sh
#
# Environment variables (optional overrides):
#   DEPLOY_USER=zaya        (default: zaya)
#   DEPLOY_DIR=/opt/zaya   (default: /opt/zaya)
# =============================================================================
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-zaya}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/zaya}"
GITLEAKS_VERSION="8.30.1"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $1"; exit 1; }
log_section() { echo -e "\n${CYAN}══ $1 ══${NC}"; }

# ── Root check ───────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  log_error "Ce script doit être exécuté en tant que root. Utilisez: sudo bash vps-init.sh"
fi

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   ZAYA — Initialisation du VPS de production  ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════╝${NC}"
echo ""
log_info "Utilisateur de déploiement : ${DEPLOY_USER}"
log_info "Répertoire de l'application : ${DEPLOY_DIR}"
echo ""

# ── 1. Mise à jour système ───────────────────────────────────────────────────
log_section "1. Mise à jour système"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
apt-get install -y -qq \
  git curl wget unzip gnupg ca-certificates lsb-release \
  ufw fail2ban htop net-tools
log_success "Système à jour, paquets essentiels installés"

# ── 2. Docker CE ─────────────────────────────────────────────────────────────
log_section "2. Installation de Docker CE"
if command -v docker &>/dev/null; then
  log_warn "Docker déjà installé : $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  log_success "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installé"
fi

# ── 3. Utilisateur de déploiement ────────────────────────────────────────────
log_section "3. Création de l'utilisateur ${DEPLOY_USER}"
if id "${DEPLOY_USER}" &>/dev/null; then
  log_warn "Utilisateur ${DEPLOY_USER} existe déjà"
else
  useradd -m -s /bin/bash "${DEPLOY_USER}"
  log_success "Utilisateur ${DEPLOY_USER} créé"
fi
usermod -aG docker "${DEPLOY_USER}"
log_success "${DEPLOY_USER} ajouté au groupe docker"

# Répertoire SSH pour les clés autorisées
mkdir -p "/home/${DEPLOY_USER}/.ssh"
chmod 700 "/home/${DEPLOY_USER}/.ssh"
touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"

echo ""
log_warn "═══════════════════════════════════════════════════════════════"
log_warn "  ACTION REQUISE : Ajoute ta clé SSH publique AVANT de        "
log_warn "  continuer (tu seras déconnecté du login par mot de passe) : "
echo ""
echo "    echo '<ta_cle_publique_id_rsa.pub>' >> /home/${DEPLOY_USER}/.ssh/authorized_keys"
echo ""
log_warn "  Teste la connexion dans un autre terminal AVANT de continuer."
log_warn "═══════════════════════════════════════════════════════════════"
echo ""
read -rp "  Appuie sur ENTRÉE une fois ta clé ajoutée et testée... "

# ── 4. Pare-feu UFW ──────────────────────────────────────────────────────────
log_section "4. Configuration du pare-feu UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh    comment 'SSH'
ufw allow 80/tcp  comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
log_success "UFW activé — ports ouverts : 22, 80, 443"
ufw status verbose

# ── 5. fail2ban ──────────────────────────────────────────────────────────────
log_section "5. Configuration de fail2ban"

cat > /etc/fail2ban/filter.d/nginx-429.conf << 'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST|PUT|DELETE|PATCH|HEAD) .*" 429
ignoreregex =
EOF

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 86400

[nginx-429]
enabled  = true
port     = http,https
filter   = nginx-429
logpath  = /var/log/nginx/access.log
maxretry = 50
findtime = 60
bantime  = 3600
EOF

systemctl enable fail2ban
systemctl restart fail2ban
log_success "fail2ban configuré (SSH max 3 tentatives/24h ban, 429 max 50/min)"

# ── 6. Hardening SSH ─────────────────────────────────────────────────────────
log_section "6. Hardening SSH"

SSHD_CONFIG="/etc/ssh/sshd_config"
cp "${SSHD_CONFIG}" "${SSHD_CONFIG}.bak.$(date +%Y%m%d)"

set_ssh_option() {
  local key="$1" value="$2"
  if grep -q "^${key}" "${SSHD_CONFIG}"; then
    sed -i "s/^${key}.*/${key} ${value}/" "${SSHD_CONFIG}"
  elif grep -q "^#${key}" "${SSHD_CONFIG}"; then
    sed -i "s/^#${key}.*/${key} ${value}/" "${SSHD_CONFIG}"
  else
    echo "${key} ${value}" >> "${SSHD_CONFIG}"
  fi
}

set_ssh_option "PermitRootLogin"          "no"
set_ssh_option "PasswordAuthentication"   "no"
set_ssh_option "PubkeyAuthentication"     "yes"
set_ssh_option "AuthorizedKeysFile"       ".ssh/authorized_keys"
set_ssh_option "X11Forwarding"            "no"
set_ssh_option "MaxAuthTries"             "3"
set_ssh_option "LoginGraceTime"           "30"
set_ssh_option "ClientAliveInterval"      "300"
set_ssh_option "ClientAliveCountMax"      "2"

sshd -t   # test config avant de recharger
systemctl restart sshd
log_success "SSH durci — root et authentification par mot de passe désactivés"

# ── 7. gitleaks ──────────────────────────────────────────────────────────────
log_section "7. Installation de gitleaks ${GITLEAKS_VERSION}"
if command -v gitleaks &>/dev/null; then
  log_warn "gitleaks déjà installé : $(gitleaks version)"
else
  ARCH=$(uname -m)
  [ "$ARCH" = "x86_64" ] && ARCH="x64" || ARCH="arm64"
  TARBALL="gitleaks_${GITLEAKS_VERSION}_linux_${ARCH}.tar.gz"
  wget -q "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${TARBALL}" \
    -O /tmp/gitleaks.tar.gz
  tar -xz -C /usr/local/bin -f /tmp/gitleaks.tar.gz gitleaks
  chmod +x /usr/local/bin/gitleaks
  rm /tmp/gitleaks.tar.gz
  log_success "gitleaks $(gitleaks version) installé dans /usr/local/bin/"
fi

# ── 8. Répertoire de l'application ───────────────────────────────────────────
log_section "8. Répertoire de l'application"
mkdir -p "${DEPLOY_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_DIR}"
log_success "Répertoire créé : ${DEPLOY_DIR} (propriétaire : ${DEPLOY_USER})"

# ── 9. Certbot (Let's Encrypt) ───────────────────────────────────────────────
log_section "9. Installation de Certbot"
if command -v certbot &>/dev/null; then
  log_warn "Certbot déjà installé : $(certbot --version)"
else
  snap install --classic certbot 2>/dev/null || apt-get install -y -qq certbot
  log_success "Certbot installé"
fi

# ── Résumé ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Initialisation VPS terminée avec succès !        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Étape suivante — connecte-toi en tant que ${DEPLOY_USER} et déploie :"
echo ""
echo "    su - ${DEPLOY_USER}"
echo "    cd ${DEPLOY_DIR}"
echo "    git clone https://github.com/jclaude45/ticketing-platform.git ."
echo "    bash scripts/deploy.sh --first-run"
echo ""
