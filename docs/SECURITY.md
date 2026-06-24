# Ticketing Platform - Security Implementation Guide

## Overview

This document describes the security architecture, controls, and implementation details for the Ticketing Platform. Security is implemented in layers: transport (TLS), authentication (JWT + 2FA), authorization (RBAC), data integrity (RSA-signed QR codes), and operational (rate limiting, audit logs).

---

## 1. JWT Authentication Flow

### Access Token + Refresh Token Pattern

The platform uses a dual-token strategy to balance security and user experience:

```
Token Type    | Lifetime | Storage          | Usage
-------------|---------|-----------------|---------------------------
Access Token  | 15 min  | Memory (JS var) | API request authorization
Refresh Token | 7 days  | HttpOnly cookie  | Obtain new access tokens
```

### Token Issuance

```
POST /auth/login
  -> Verify email/password (bcrypt compare)
  -> [If 2FA enabled] -> return twoFactorToken (short-lived, not an access token)
  -> [If 2FA disabled or verified] ->
       accessToken  = JWT.sign({ sub: userId, role, email }, JWT_SECRET, { expiresIn: '15m' })
       refreshToken = JWT.sign({ sub: userId, jti: uuid }, JWT_REFRESH_SECRET, { expiresIn: '7d' })
       Store SHA-256(refreshToken) in refresh_tokens table
       Return both tokens
```

### Access Token Structure

```json
{
  "header": { "alg": "HS256", "typ": "JWT" },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "role": "ATTENDEE",
    "iat": 1704153600,
    "exp": 1704154500
  }
}
```

### Token Refresh

```
POST /auth/refresh
  -> Verify refreshToken signature with JWT_REFRESH_SECRET
  -> Compute SHA-256(refreshToken)
  -> Query refresh_tokens WHERE token_hash = hash AND is_revoked = false AND expires_at > NOW()
  -> If not found: return 401 (stolen/expired token)
  -> Issue new accessToken
  -> Rotate refreshToken (revoke old, issue new) -- refresh token rotation
```

### Token Revocation (Logout)

```
POST /auth/logout
  -> Mark refresh_tokens.is_revoked = true WHERE token_hash = SHA-256(refreshToken)
  -> Clear HttpOnly cookie
```

### Implementation Notes

- JWT secrets are loaded from environment variables (minimum 32 characters)
- `HS256` algorithm used (sufficient for internal tokens; RS256 for multi-service setups)
- Access tokens are NOT stored in the database - they are stateless and verified cryptographically
- Refresh tokens are hashed before storage (SHA-256) - raw tokens never stored

---

## 2. RSA-4096 QR Code Ticket Signing

Tickets are signed with RSA-4096 to prevent forgery. Even if someone knows the ticket code, they cannot create a valid QR code without the private key.

### Key Generation

```bash
# Generate RSA-4096 private key
openssl genrsa -out keys/private.pem 4096

# Extract public key
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

Keys are stored in `./keys/` and mounted read-only into the backend container. They are never exposed via API or stored in the database.

### QR Payload Structure

When a ticket is issued, the following payload is constructed:

```json
{
  "ticketId": "550e8400-e29b-41d4-a716-446655440000",
  "eventId":  "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "holderId": "8e7b3a1d-8c3f-4cde-bd36-5e5fc5c4e9a1",
  "ticketCode": "ABCD-EFGH-IJKL",
  "issuedAt": "2025-01-10T14:30:00Z",
  "eventStartDate": "2025-06-01T09:00:00Z",
  "eventEndDate": "2025-06-02T23:59:59Z",
  "nonce": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Signing Process (Ticket Issuance)

```
1. Serialize payload to JSON string (deterministic key order)
2. Compute SHA-256 hash of JSON string
3. Sign hash with RSA-4096 private key (PKCS#1 v1.5)
4. Encode: Base64URL(JSON payload) + "." + Base64URL(signature)
5. Store the full qrData string in tickets.qr_data
6. Generate QR code image from qrData string
```

### Verification Process (Ticket Scanning)

```
1. Receive qrData from scanner
2. Split on "." -> [b64Payload, b64Signature]
3. Decode b64Payload -> JSON payload
4. Decode b64Signature -> signature bytes
5. Compute SHA-256(b64Payload)
6. RSA verify(hash, signature, publicKey) -> must be true
7. Parse payload: check ticketId, eventId, nonce
8. Database lookup: SELECT * FROM tickets WHERE id = ticketId
9. Validate:
   - ticket.qr_nonce == payload.nonce (prevents QR image reuse after re-issue)
   - ticket.event_id == payload.eventId (prevents cross-event use)
   - ticket.status == 'ACTIVE' (prevents reuse)
   - payload.eventEndDate > NOW() (not expired)
10. Atomic update: UPDATE tickets SET status='USED', scanned_at=NOW() WHERE id=ticketId AND status='ACTIVE'
    -> affected rows must be 1 (prevents race condition double-scan)
11. Return result
```

### Security Properties

| Property | How Achieved |
|----------|-------------|
| Forgery prevention | RSA-4096 signature - requires private key |
| Replay prevention | Nonce in payload + atomic status update |
| Cross-event use | eventId in payload, verified on scan |
| Screenshot/photo reuse | Status set to USED atomically; only first scan wins |
| Key compromise detection | Nonce stored in DB - can re-issue with new key and new nonce |

---

## 3. Two-Factor Authentication (TOTP)

The platform implements TOTP (Time-based One-Time Password) as defined in RFC 6238, compatible with Google Authenticator, Authy, 1Password, etc.

### Enable 2FA Flow

```
1. User calls POST /auth/2fa/enable (requires active session)
2. Backend generates TOTP secret: speakeasy.generateSecret({ length: 32 })
3. Returns: { secret, qrCodeUrl, otpauthUrl }
   - qrCodeUrl is a data URI of the QR code image
   - User scans QR with authenticator app
4. User calls POST /auth/2fa/confirm { code: "123456" }
5. Backend verifies: speakeasy.totp.verify({ secret, token: code, window: 1 })
6. If valid: store encrypted secret in two_factor_secrets table, set users.two_factor_enabled = true
```

### Secret Storage

TOTP secrets are encrypted at rest:
- Encrypted with AES-256-GCM using the `JWT_SECRET` as key material
- Stored in `two_factor_secrets.encrypted_secret`
- Never returned via API after initial setup

### Login with 2FA

```
POST /auth/login { email, password }
  -> credentials valid, 2FA enabled
  -> Return { requiresTwoFactor: true, twoFactorToken: "<signed JWT, exp 5 min>" }

POST /auth/2fa/verify { twoFactorToken, code }
  -> Verify twoFactorToken signature and expiry
  -> Decrypt TOTP secret for user
  -> speakeasy.totp.verify({ secret, token: code, window: 1 })
     (window: 1 allows ±30 seconds clock drift)
  -> If valid: issue full accessToken + refreshToken
  -> If invalid: increment failed attempt counter
```

### TOTP Security Notes

- Secrets are 32 characters base32 (160 bits of entropy)
- Time window of ±1 step (30 seconds) is NIST-recommended
- Each TOTP code can only be used once (Redis deduplication cache)
- 5 failed 2FA attempts triggers a 15-minute lockout

---

## 4. Rate Limiting

Rate limiting is enforced at two levels: Nginx (connection/request limiting) and NestJS application (ThrottlerModule).

### Nginx Rate Limiting Zones

```nginx
# General API: 100 requests/minute per IP
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;

# Auth endpoints: 10 requests/minute per IP (brute force protection)
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;

# Ticket scanning: 30 scans/minute per IP
limit_req_zone $binary_remote_addr zone=scan_limit:10m rate=30r/m;
```

### NestJS ThrottlerModule

```typescript
// app.module.ts
ThrottlerModule.forRoot([{
  ttl: 60000,  // 1 minute window
  limit: 100,  // 100 requests per window
}])
```

Custom limits per endpoint:
```typescript
@Throttle({ default: { limit: 5, ttl: 60000 } })  // Auth: 5/min
@Post('login')
async login() { ... }

@Throttle({ default: { limit: 30, ttl: 60000 } })  // Scan: 30/min
@Post('scan')
async scanTicket() { ... }
```

Rate limit exceeded returns `HTTP 429 Too Many Requests` with:
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

### Account Lockout

After 5 consecutive failed login attempts:
- Account locked for 15 minutes (`users.locked_until = NOW() + interval '15 minutes'`)
- `users.failed_login_attempts` counter reset on successful login
- Lockout events written to `audit_logs`

---

## 5. Role-Based Access Control (RBAC)

### Role Hierarchy

```
SUPER_ADMIN
    |
  ADMIN
    |
 ORGANIZER -------- CONTROLLER
    |                    |
 ATTENDEE           (scan only)
```

### Role Permissions Matrix

| Action | ATTENDEE | CONTROLLER | ORGANIZER | ADMIN | SUPER_ADMIN |
|--------|----------|------------|-----------|-------|-------------|
| View published events | Yes | Yes | Yes | Yes | Yes |
| Purchase tickets | Yes | No | Yes | Yes | Yes |
| View own tickets | Yes | Yes | Yes | Yes | Yes |
| Scan tickets | No | Yes (own events) | Yes (own events) | Yes | Yes |
| Create events | No | No | Yes | Yes | Yes |
| Manage own events | No | No | Yes | Yes | Yes |
| Manage all events | No | No | No | Yes | Yes |
| View analytics (own) | No | No | Yes | Yes | Yes |
| View all analytics | No | No | No | Yes | Yes |
| Manage users | No | No | No | Yes | Yes |
| Change user roles | No | No | No | No | Yes |
| System configuration | No | No | No | No | Yes |

### NestJS Guard Implementation

```typescript
// roles.decorator.ts
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!requiredRoles) return true;
    const user = context.switchToHttp().getRequest().user;
    return requiredRoles.some(role => user.role === role || user.role === UserRole.SUPER_ADMIN);
  }
}

// Usage in controller:
@Roles(UserRole.ORGANIZER, UserRole.ADMIN)
@Post('events')
async createEvent() { ... }
```

### Resource Ownership

Controllers check both role AND ownership:
```typescript
// Only the event's organizer (or admin) can modify it
async updateEvent(eventId: string, user: User) {
  const event = await this.eventsService.findById(eventId);
  if (event.organizerId !== user.id && !isAdminRole(user.role)) {
    throw new ForbiddenException('You do not own this event');
  }
}
```

---

## 6. Password Security

- Passwords hashed with **bcrypt** (cost factor 12)
- Minimum requirements enforced: 8+ chars, uppercase, lowercase, number, special char
- Password history: last 5 passwords cannot be reused
- Password reset tokens: cryptographically random (32 bytes), expire in 1 hour, single use

```typescript
// Hash on registration/change
const hash = await bcrypt.hash(password, 12);

// Verify on login
const isValid = await bcrypt.compare(candidatePassword, storedHash);
```

---

## 7. Transport Security

- All production traffic over TLS 1.2+ (configured in Nginx)
- Cipher suite: ECDHE+AESGCM and CHACHA20 (forward secrecy)
- HSTS header: `max-age=63072000; includeSubDomains; preload`
- SSL certificates via Let's Encrypt (auto-renew)
- OCSP Stapling enabled for faster cert validation

---

## 8. Input Validation & Injection Prevention

- All inputs validated via `class-validator` decorators in NestJS DTOs
- SQL injection prevented by using Prisma ORM (parameterized queries)
- XSS prevented via `Content-Security-Policy` header
- File uploads: MIME type validation, extension allowlist, size limits (50MB)

---

## 9. Secrets Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| JWT_SECRET | Environment variable | Rotate with rolling restart |
| DB passwords | Environment variable | Rotate with downtime |
| RSA private key | File (/app/keys/private.pem) | Rotation invalidates all QR codes |
| TOTP secrets | Encrypted in DB | Per-user (on 2FA disable/re-enable) |
| Stripe keys | Environment variable | Via Stripe dashboard |
| AWS keys | Environment variable | Via IAM rotation |

**Production recommendation:** Use AWS Secrets Manager, HashiCorp Vault, or similar for secrets at rest rather than environment variables on disk.

---

## 10. Audit Logging

All security-sensitive operations are logged to `audit_logs`:

| Action | Trigger |
|--------|---------|
| `AUTH_LOGIN_SUCCESS` | Successful login |
| `AUTH_LOGIN_FAILURE` | Failed login attempt |
| `AUTH_LOGOUT` | User logout |
| `AUTH_2FA_ENABLED` | 2FA activated |
| `AUTH_2FA_DISABLED` | 2FA deactivated |
| `AUTH_PASSWORD_RESET` | Password reset completed |
| `AUTH_TOKEN_REFRESH` | Access token refreshed |
| `TICKET_SCANNED` | Ticket validated at event |
| `TICKET_SCAN_FAILED` | Invalid/duplicate scan attempt |
| `TICKET_TRANSFERRED` | Ticket transferred to new holder |
| `ORDER_CREATED` | New purchase order |
| `ORDER_REFUNDED` | Refund processed |
| `USER_ROLE_CHANGED` | User role modified |
| `ACCOUNT_LOCKED` | Account locked (failed attempts) |

Logs include: `user_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `created_at`.

Audit logs are append-only at the application level. Database permissions should prevent UPDATE/DELETE on this table.
