# Ticketing Platform

A full-stack, production-ready ticketing platform with RSA-4096 signed QR codes, real-time scanning, two-factor authentication, and a Flutter mobile app.

---

## Architecture

```
                        Internet
                           |
               +-----------+-----------+
               |      Nginx (TLS)      |
               |     Port 80/443       |
               +-----------+-----------+
                           |
           +---------------+---------------+
           |                               |
 +---------+---------+         +-----------+----------+
 |  Next.js Frontend |         |   NestJS Backend      |
 |    Port 3000      |         |      Port 3001        |
 |                   |         |                       |
 | - Event browsing  |         | - REST API (Swagger)  |
 | - Ticket purchase |         | - WebSockets          |
 | - QR ticket view  |         | - Prisma ORM          |
 | - Organizer dash  |         | - JWT + 2FA Auth      |
 |                   |         | - RSA-4096 QR Signing |
 +-------------------+         +-----------+----------+
                                           |
                       +-------------------+-------------------+
                       |                                       |
           +-----------+----------+             +--------------+------+
           |   PostgreSQL 16      |             |    Redis 7          |
           |   Port 5432          |             |    Port 6379        |
           |                      |             |                     |
           | Users, Events,       |             | Sessions, Queues,   |
           | Tickets, Orders,     |             | Rate Limiting,      |
           | Payments, Audit Logs |             | WebSocket Pub/Sub   |
           +----------------------+             +---------------------+

External:  [ AWS S3 ] [ Stripe ] [ SMTP Email ] [ Let's Encrypt ]

Mobile:    [ Flutter iOS/Android - Attendee + Controller App ]
```

---

## Features

### Core Features
- **Event Management** - Create, publish, and manage events with rich details
- **Multi-tier Ticketing** - Multiple ticket types per event (Early Bird, General, VIP)
- **Real-time Inventory** - Live stock tracking with WebSocket updates
- **Secure Checkout** - Stripe payment processing with webhook verification
- **RSA-4096 QR Tickets** - Cryptographically signed, forgery-proof QR codes
- **Ticket Scanning** - Real-time QR validation with live attendance dashboard
- **Ticket Transfers** - Transfer tickets between users
- **Analytics Dashboard** - Sales charts, attendance rates, revenue tracking

### Security Features
- **JWT Authentication** - Short-lived access tokens + rotating refresh tokens
- **TOTP Two-Factor Auth** - Google Authenticator / Authy compatible
- **Role-Based Access Control** - ATTENDEE, CONTROLLER, ORGANIZER, ADMIN, SUPER_ADMIN
- **Rate Limiting** - Nginx + NestJS throttling, brute-force protection
- **Account Lockout** - Auto-lock after 5 failed login attempts
- **Audit Logs** - Tamper-evident log of all security events
- **HTTPS Only** - TLS 1.2+, HSTS, OCSP stapling

### Mobile App (Flutter)
- Attendee: Purchase tickets, view QR codes, manage profile
- Controller: Camera-based QR scanning with offline fallback
- Real-time scan feedback with attendee details

---

## Quick Start

### Prerequisites
- Docker Desktop 4.x+
- Node.js 20+
- OpenSSL

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/ticketing-platform.git
cd ticketing-platform
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 2. Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| API Docs | http://localhost:3001/api/v1/docs |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

### 3. Default Credentials (Development)

After seeding, you can log in with:

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@ticketing.com | Admin123! |
| Organizer | organizer@ticketing.com | Organizer123! |
| Controller | controller@ticketing.com | Controller123! |
| Attendee | attendee@ticketing.com | Attendee123! |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | NestJS 10, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 (uuid-ossp, pgcrypto) |
| Cache / Queue | Redis 7, Bull |
| Auth | JWT (HS256), bcrypt, speakeasy (TOTP) |
| QR Signing | RSA-4096 (OpenSSL) |
| Payments | Stripe |
| File Storage | AWS S3 |
| Email | Nodemailer (SMTP) |
| Real-time | Socket.IO |
| Mobile | Flutter 3 (iOS + Android) |
| Web Server | Nginx (reverse proxy + TLS) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions |

---

## Project Structure

```
ticketing-platform/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/             # Authentication & 2FA
│   │   ├── events/           # Event management
│   │   ├── tickets/          # Ticket issuance & scanning
│   │   ├── orders/           # Order & payment processing
│   │   ├── users/            # User management
│   │   ├── analytics/        # Analytics & reporting
│   │   ├── notifications/    # Email & push notifications
│   │   └── websockets/       # Socket.IO gateway
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   ├── migrations/       # Migration history
│   │   └── seed.ts           # Seed data
│   └── Dockerfile
│
├── frontend/                 # Next.js Web App
│   ├── app/                  # App Router pages
│   ├── components/           # Reusable UI components
│   ├── lib/                  # API client, utilities
│   └── Dockerfile
│
├── mobile/                   # Flutter App
│   ├── lib/
│   │   ├── screens/          # App screens
│   │   ├── models/           # Data models
│   │   ├── services/         # API services
│   │   └── widgets/          # Custom widgets
│   └── pubspec.yaml
│
├── docker/
│   ├── nginx/
│   │   ├── nginx.conf        # Nginx configuration
│   │   └── ssl/              # SSL certificates
│   └── postgres/
│       └── init.sql          # DB initialization
│
├── scripts/
│   ├── setup.sh              # Development setup
│   ├── deploy.sh             # Production deployment
│   └── generate-keys.sh      # RSA key generation
│
├── keys/                     # RSA key pair (gitignored)
│   ├── private.pem
│   └── public.pem
│
├── docs/
│   ├── ARCHITECTURE.md       # System design
│   ├── API.md                # Full API reference
│   ├── DEPLOYMENT.md         # Deployment guide
│   ├── DATABASE_SCHEMA.md    # DB schema docs
│   └── SECURITY.md           # Security implementation
│
├── docker-compose.yml        # Development compose
├── docker-compose.prod.yml   # Production overrides
├── .env.example              # Environment template
└── README.md
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API.md) | All REST endpoints and WebSocket events |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flows, component diagrams |
| [Deployment Guide](docs/DEPLOYMENT.md) | Local dev, VPS production, SSL setup |
| [Database Schema](docs/DATABASE_SCHEMA.md) | Tables, columns, indexes, enums |
| [Security Guide](docs/SECURITY.md) | JWT, RSA-4096, 2FA, RBAC, rate limiting |

---

## Development Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend

# Run migrations
docker compose exec backend npx prisma migrate dev --name <migration-name>

# Open Prisma Studio
docker compose exec backend npx prisma studio

# Run backend tests
docker compose exec backend npm test

# Run frontend tests
docker compose exec frontend npm test

# Rebuild a service
docker compose up -d --build backend

# Stop everything
docker compose down

# Reset database (destructive!)
docker compose down -v && docker compose up -d
```

---

## Flutter Mobile App Setup

```bash
# Prerequisites: Flutter SDK 3.x+, Android Studio or Xcode

cd mobile
flutter pub get
flutter run

# For specific platform:
flutter run -d android
flutter run -d ios

# Build release:
flutter build apk --release
flutter build ios --release
```

Configure the API URL in `mobile/lib/config/app_config.dart`:
```dart
const String apiBaseUrl = 'https://yourdomain.com/api/v1';
const String wsUrl = 'wss://yourdomain.com';
```

---

## Production Deployment

See the complete [Deployment Guide](docs/DEPLOYMENT.md) for step-by-step instructions.

Quick summary:
```bash
# On your production server (Ubuntu 22.04)
git clone https://github.com/your-org/ticketing-platform.git
cd ticketing-platform
cp .env.example .env
nano .env  # Fill in production secrets
./scripts/generate-keys.sh
# Setup SSL (see deployment guide)
./scripts/deploy.sh
```

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Commit Convention
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `chore:` Build/tooling changes
- `security:` Security fix

---

## License

MIT License - see [LICENSE](LICENSE) for details.
