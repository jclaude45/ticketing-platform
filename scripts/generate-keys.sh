#!/bin/bash
# =============================================================================
# Ticketing Platform - RSA-4096 Key Generation Script
# =============================================================================
# Generates RSA-4096 key pair used for signing and verifying QR code tickets.
# Keys are stored in ./keys/ and mounted read-only into the backend container.
# =============================================================================
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
KEYS_DIR="${PROJECT_ROOT}/keys"

echo ""
echo "==========================================="
echo "  RSA-4096 Key Generation"
echo "==========================================="
echo ""

# Check openssl is available
if ! command -v openssl &>/dev/null; then
    echo -e "${RED}[ERROR]${NC} openssl is not installed."
    echo "  macOS: brew install openssl"
    echo "  Ubuntu: sudo apt-get install openssl"
    exit 1
fi

echo -e "${BLUE}[INFO]${NC} OpenSSL version: $(openssl version)"

# Create keys directory
mkdir -p "$KEYS_DIR"
chmod 700 "$KEYS_DIR"

# Check if keys already exist
if [ -f "${KEYS_DIR}/private.pem" ] && [ -f "${KEYS_DIR}/public.pem" ]; then
    echo -e "${YELLOW}[WARN]${NC} Keys already exist in ${KEYS_DIR}/"
    read -p "Overwrite existing keys? This will invalidate all existing signed QR codes! (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}[INFO]${NC} Key generation skipped."
        exit 0
    fi
    # Backup existing keys
    BACKUP_SUFFIX=$(date +%Y%m%d_%H%M%S)
    cp "${KEYS_DIR}/private.pem" "${KEYS_DIR}/private.pem.bak.${BACKUP_SUFFIX}"
    cp "${KEYS_DIR}/public.pem" "${KEYS_DIR}/public.pem.bak.${BACKUP_SUFFIX}"
    echo -e "${YELLOW}[WARN]${NC} Old keys backed up with suffix .bak.${BACKUP_SUFFIX}"
fi

# Generate RSA-4096 private key
echo -e "${BLUE}[INFO]${NC} Generating RSA-4096 private key (this may take a moment)..."
openssl genrsa -out "${KEYS_DIR}/private.pem" 4096
chmod 600 "${KEYS_DIR}/private.pem"
echo -e "${GREEN}[SUCCESS]${NC} Private key generated: ${KEYS_DIR}/private.pem"

# Extract public key from private key
echo -e "${BLUE}[INFO]${NC} Extracting public key..."
openssl rsa -in "${KEYS_DIR}/private.pem" -pubout -out "${KEYS_DIR}/public.pem"
chmod 644 "${KEYS_DIR}/public.pem"
echo -e "${GREEN}[SUCCESS]${NC} Public key extracted: ${KEYS_DIR}/public.pem"

# Verify the key pair
echo -e "${BLUE}[INFO]${NC} Verifying key pair..."
TEST_DATA="ticketing-platform-key-verification-$(date +%s)"
SIGNATURE_FILE=$(mktemp)
VERIFY_FILE=$(mktemp)

# Sign test data
echo "$TEST_DATA" | openssl dgst -sha256 -sign "${KEYS_DIR}/private.pem" -out "$SIGNATURE_FILE"

# Verify signature
if echo "$TEST_DATA" | openssl dgst -sha256 -verify "${KEYS_DIR}/public.pem" -signature "$SIGNATURE_FILE" &>/dev/null; then
    echo -e "${GREEN}[SUCCESS]${NC} Key pair verified - signing and verification work correctly"
else
    echo -e "${RED}[ERROR]${NC} Key pair verification failed!"
    rm -f "$SIGNATURE_FILE" "$VERIFY_FILE"
    exit 1
fi

rm -f "$SIGNATURE_FILE" "$VERIFY_FILE"

# Display key info
echo ""
echo "Key Information:"
echo "-----------------------------------------"
echo "Algorithm: RSA"
KEY_BITS=$(openssl rsa -in "${KEYS_DIR}/private.pem" -text -noout 2>/dev/null | grep "Private-Key" | grep -oP '\d+' || echo "4096")
echo "Key Size:  ${KEY_BITS} bits"
echo "Private:   ${KEYS_DIR}/private.pem (chmod 600)"
echo "Public:    ${KEYS_DIR}/public.pem (chmod 644)"
echo ""

# Create a .gitignore in the keys directory
cat > "${KEYS_DIR}/.gitignore" << 'EOF'
# Ignore all key files - NEVER commit keys to version control
*.pem
*.key
*.p12
*.pfx
*.bak.*
EOF

echo -e "${GREEN}[SUCCESS]${NC} .gitignore created in keys/ to prevent accidental commits"

echo ""
echo "==========================================="
echo -e "${GREEN}  Key generation complete!${NC}"
echo "==========================================="
echo ""
echo -e "${YELLOW}IMPORTANT SECURITY NOTES:${NC}"
echo "  1. The private key (private.pem) is SECRET - never share or commit it"
echo "  2. Back up the private key securely (e.g., encrypted storage, HSM)"
echo "  3. The public key can be shared safely"
echo "  4. Rotating keys invalidates all previously signed QR codes"
echo "  5. In production, consider using AWS KMS or HashiCorp Vault"
echo ""
echo "The keys directory is mounted read-only into the backend container."
echo "Environment variables RSA_PRIVATE_KEY_PATH and RSA_PUBLIC_KEY_PATH"
echo "should point to /app/keys/private.pem and /app/keys/public.pem"
echo ""
