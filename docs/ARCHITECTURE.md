# Ticketing Platform - Architecture

## System Overview

The Ticketing Platform is a full-stack, containerized web application that enables event organizers to create events, sell tickets, and validate attendees at the door. Tickets are signed with RSA-4096 and encoded as QR codes that can be scanned by mobile controllers.

---

## Component Diagram (ASCII)

```
                           Internet
                              |
                    +---------+---------+
                    |    Nginx Reverse  |
                    |      Proxy        |
                    |   (Port 80/443)   |
                    +---------+---------+
                              |
              +---------------+---------------+
              |                               |
    +---------+----------+         +----------+---------+
    |  Next.js Frontend  |         |   NestJS Backend   |
    |   (Port 3000)      |         |   (Port 3001)      |
    |                    |         |                    |
    | - React UI         |         | - REST API         |
    | - Ticket Purchase  |         | - WebSocket (WS)   |
    | - Dashboard        |         | - Prisma ORM       |
    | - Admin Panel      |         | - JWT Auth         |
    |                    |         | - QR Signing       |
    +--------------------+         +----------+---------+
                                              |
                          +-------------------+-------------------+
                          |                                       |
              +-----------+---------+                 +-----------+---------+
              |   PostgreSQL 16     |                 |    Redis 7          |
              |   (Port 5432)       |                 |   (Port 6379)       |
              |                    |                 |                     |
              | - Users            |                 | - Session Cache     |
              | - Events           |                 | - Rate Limiting     |
              | - Tickets          |                 | - Job Queues (Bull) |
              | - Orders           |                 | - WebSocket Pub/Sub |
              | - Analytics        |                 |                     |
              +--------------------+                 +---------------------+

              External Services:
              +--------------------+    +--------------------+    +--------------------+
              |   AWS S3           |    |   SMTP (Email)     |    |  Stripe/PayPal     |
              |  (File Storage)    |    |  (Notifications)   |    |  (Payments)        |
              +--------------------+    +--------------------+    +--------------------+

              Mobile App:
              +--------------------------------------------+
              |   Flutter Mobile (iOS/Android)             |
              |  - Attendee: Purchase & view tickets       |
              |  - Controller: Scan QR codes               |
              +--------------------------------------------+
```

---

## Data Flow Diagrams

### Ticket Purchase Flow

```
Attendee Browser                Backend API              PostgreSQL        Stripe
     |                              |                        |               |
     |-- GET /events/:id ---------->|                        |               |
     |                              |-- SELECT event ------->|               |
     |                              |<-- event data ---------|               |
     |<-- event details ------------|                        |               |
     |                              |                        |               |
     |-- POST /orders/checkout ---->|                        |               |
     |   { ticketTypeId, qty }      |-- BEGIN transaction -->|               |
     |                              |-- INSERT order ------->|               |
     |                              |-- LOCK ticket stock -->|               |
     |                              |                        |               |
     |                              |-- Create payment intent--------------->|
     |                              |<-- client_secret ----------------------|
     |<-- { clientSecret } ---------|                        |               |
     |                              |                        |               |
     |-- [Stripe card payment] --------------------------------- payment ---->|
     |                              |                        |         [webhook]
     |                              |<-- POST /webhooks/stripe -------------|
     |                              |-- UPDATE order CONFIRMED ->|          |
     |                              |-- INSERT tickets (RSA-sign)>|         |
     |                              |-- COMMIT transaction -->|             |
     |                              |-- Send confirmation email             |
     |<-- GET /tickets (email) -----|                        |               |
```

### QR Code Ticket Validation Flow

```
Controller App              Backend API             PostgreSQL        Redis
     |                          |                       |               |
     |-- POST /tickets/scan --> |                       |               |
     |   { qrPayload }          |                       |               |
     |                          |-- Verify RSA signature (in-memory)    |
     |                          |                       |               |
     |                          |-- Check Redis cache ->|               |
     |                          |<-- cache hit? ---------|               |
     |                          |                       |               |
     |                          |-- SELECT ticket ----->|               |
     |                          |<-- ticket data --------|               |
     |                          |                       |               |
     |                          |-- Validate:           |               |
     |                          |   status == ACTIVE    |               |
     |                          |   eventId matches     |               |
     |                          |   not expired         |               |
     |                          |                       |               |
     |                          |-- UPDATE ticket USED ->|              |
     |                          |-- Cache invalidate ----|->             |
     |                          |-- Emit WS event       |               |
     |<-- { valid: true, name } |                       |               |
     |                          |                       |               |
```

---

## Security Architecture

### Authentication & Authorization

```
Client                    NestJS Backend                  PostgreSQL
  |                            |                               |
  |-- POST /auth/login ------->|                               |
  |   { email, password }      |-- SELECT user by email ------>|
  |                            |<-- user + hashed_password ----|
  |                            |-- bcrypt.compare(pw, hash)    |
  |                            |                               |
  |                            |  [2FA enabled?]               |
  |                            |-- Return: requiresTOTP        |
  |<-- { requiresTOTP: true } -|                               |
  |                            |                               |
  |-- POST /auth/2fa/verify -->|                               |
  |   { token: "123456" }      |-- TOTP.verify(token, secret)  |
  |                            |                               |
  |<-- { accessToken,          |                               |
  |       refreshToken } ------|                               |
  |                            |                               |
  |-- GET /events              |                               |
  |   Authorization: Bearer AT |                               |
  |                            |-- JWT.verify(AT, secret)      |
  |                            |-- Extract userId, role        |
  |                            |-- RBAC guard check            |
  |<-- [200 events data] ------|                               |
```

### RSA-4096 QR Code Signing

```
Backend (Ticket Issuance)               Flutter App (Ticket Display)
         |                                          |
         |-- Load private.pem from /app/keys/       |
         |-- Build payload:                         |
         |   { ticketId, eventId, userId,           |
         |     issuedAt, expiresAt, nonce }         |
         |-- SHA-256 hash of JSON payload           |
         |-- RSA sign with private key              |
         |-- Base64url encode {payload + signature} |
         |-- Store QR data in DB                    |
         |-- Generate QR image (qrcode lib)         |
         |-- Return QR to user                      |
                                                    |
                                           [QR displayed on phone]
                                                    |
Controller App (Scanning)                           |
         |                                          |
         |<-- Camera scans QR code -----------------|
         |-- Decode Base64url -> {payload, sig}     |
         |-- POST /tickets/scan { qrData }          |
         |                                          |
Backend (Validation)                                |
         |-- Load public.pem from /app/keys/        |
         |-- RSA verify(payload, signature, pubkey) |
         |-- Parse payload fields                   |
         |-- Check DB: ticket status, event match   |
         |-- Mark USED atomically                   |
         |<-- { valid, attendeeName }               |
```

---

## API Endpoints List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/v1/auth/register | Register new user | Public |
| POST | /api/v1/auth/login | Login | Public |
| POST | /api/v1/auth/refresh | Refresh access token | Refresh token |
| POST | /api/v1/auth/logout | Logout | Bearer |
| POST | /api/v1/auth/2fa/enable | Enable 2FA | Bearer |
| POST | /api/v1/auth/2fa/verify | Verify TOTP | Bearer |
| POST | /api/v1/auth/password/reset | Request password reset | Public |
| GET | /api/v1/events | List events | Public |
| POST | /api/v1/events | Create event | ORGANIZER |
| GET | /api/v1/events/:id | Get event | Public |
| PATCH | /api/v1/events/:id | Update event | ORGANIZER |
| DELETE | /api/v1/events/:id | Delete event | ORGANIZER |
| GET | /api/v1/events/:id/tickets | List ticket types | Public |
| POST | /api/v1/events/:id/tickets | Create ticket type | ORGANIZER |
| GET | /api/v1/orders | List user orders | Bearer |
| POST | /api/v1/orders/checkout | Create order | Bearer |
| GET | /api/v1/orders/:id | Get order | Bearer |
| POST | /api/v1/tickets/scan | Scan/validate ticket | CONTROLLER |
| GET | /api/v1/tickets/:id | Get ticket | Bearer |
| GET | /api/v1/tickets/:id/qr | Get ticket QR code | Bearer |
| GET | /api/v1/users/me | Get current user | Bearer |
| PATCH | /api/v1/users/me | Update profile | Bearer |
| GET | /api/v1/analytics/events/:id | Event analytics | ORGANIZER |
| GET | /api/v1/analytics/dashboard | Organizer dashboard | ORGANIZER |
| GET | /api/v1/admin/users | List users | ADMIN |
| POST | /api/v1/webhooks/stripe | Stripe webhooks | Stripe signature |
| GET | /api/v1/health | Health check | Public |

---

## Database Schema Description

### Core Entities

- **users** - Accounts (attendees, organizers, controllers, admins)
- **events** - Ticketed events with capacity limits and scheduling
- **ticket_types** - Price tiers per event (General, VIP, Early Bird, etc.)
- **orders** - Purchase transactions linking users to ticket types
- **tickets** - Individual issued tickets with RSA-signed QR data
- **payments** - Payment records linked to orders
- **controllers** - Mapping of controllers assigned to events
- **notifications** - In-app and email notification log
- **audit_logs** - Security audit trail
- **analytics_snapshots** - Periodic analytics captures

### Key Relationships

```
users 1---* orders *---* tickets
events 1---* ticket_types 1---* tickets
orders 1---1 payments
events *---* users (controllers via event_controllers join table)
```
