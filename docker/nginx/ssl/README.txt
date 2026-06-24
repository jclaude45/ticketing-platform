SSL Certificate Directory
=========================

This directory should contain the following SSL certificate files:

  fullchain.pem  - Full certificate chain (certificate + intermediates)
  privkey.pem    - Private key
  chain.pem      - Intermediate certificate chain only

For LOCAL DEVELOPMENT, generate self-signed certificates:
  cd /path/to/ticketing-platform
  ./scripts/generate-ssl-dev.sh

For PRODUCTION, use Let's Encrypt via Certbot:
  certbot certonly --webroot \
    -w /var/www/certbot \
    -d yourdomain.com \
    -d www.yourdomain.com \
    --email your@email.com \
    --agree-tos \
    --no-eff-email

Then copy/symlink the certificates:
  cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./fullchain.pem
  cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./privkey.pem
  cp /etc/letsencrypt/live/yourdomain.com/chain.pem ./chain.pem

SECURITY NOTE: Never commit certificate files to version control.
These files are already added to .gitignore.
