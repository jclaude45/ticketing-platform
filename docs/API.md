# Ticketing Platform - API Reference

**Base URL:** `https://yourdomain.com/api/v1`
**Interactive Docs:** `https://yourdomain.com/api/v1/docs` (Swagger UI)

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

Access tokens expire in 15 minutes. Use the refresh token endpoint to obtain a new one.

---

## Auth Endpoints

### POST /auth/register
Register a new user account.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response 201:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ATTENDEE",
    "createdAt": "2025-01-01T00:00:00Z"
  },
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

**Errors:** 400 (validation), 409 (email taken)

---

### POST /auth/login
Authenticate with email and password.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response 200 (no 2FA):**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": { "id": "uuid", "email": "...", "role": "ATTENDEE" }
}
```

**Response 200 (2FA required):**
```json
{
  "requiresTwoFactor": true,
  "twoFactorToken": "temp-token-valid-5-min"
}
```

**Errors:** 401 (invalid credentials), 429 (rate limited)

---

### POST /auth/2fa/verify
Complete 2FA login with TOTP code.

**Body:**
```json
{
  "twoFactorToken": "temp-token",
  "code": "123456"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

---

### POST /auth/2fa/enable
Enable two-factor authentication.

**Auth:** Bearer token required

**Response 200:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeUrl": "data:image/png;base64,...",
  "otpauthUrl": "otpauth://totp/TicketPlatform:user@email.com?secret=..."
}
```

---

### POST /auth/2fa/disable
Disable two-factor authentication.

**Auth:** Bearer token required

**Body:**
```json
{ "code": "123456" }
```

---

### POST /auth/refresh
Obtain a new access token using the refresh token.

**Body:**
```json
{ "refreshToken": "eyJhbGci..." }
```

**Response 200:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

---

### POST /auth/logout
Invalidate the refresh token.

**Auth:** Bearer token required

**Response 204:** No content

---

### POST /auth/password/forgot
Request a password reset email.

**Body:**
```json
{ "email": "user@example.com" }
```

**Response 200:** Always returns success (prevents email enumeration)

---

### POST /auth/password/reset
Reset password with token from email.

**Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass123!"
}
```

---

## Events Endpoints

### GET /events
List published events.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 20 | Items per page (max 100) |
| search | string | - | Search in title/description |
| category | string | - | Filter by category |
| startDate | ISO date | - | Filter events starting after date |
| endDate | ISO date | - | Filter events starting before date |
| status | string | PUBLISHED | Event status filter |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Tech Conference 2025",
      "description": "Annual tech event...",
      "startDate": "2025-06-01T09:00:00Z",
      "endDate": "2025-06-02T18:00:00Z",
      "venue": "Convention Center",
      "city": "San Francisco",
      "country": "US",
      "category": "Technology",
      "coverImageUrl": "https://...",
      "status": "PUBLISHED",
      "ticketTypes": [
        { "id": "uuid", "name": "General", "price": 49.99, "available": 150 }
      ],
      "organizer": { "id": "uuid", "name": "Acme Corp" }
    }
  ],
  "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

### POST /events
Create a new event.

**Auth:** ORGANIZER role required

**Body:**
```json
{
  "title": "Tech Conference 2025",
  "description": "Full description...",
  "startDate": "2025-06-01T09:00:00Z",
  "endDate": "2025-06-02T18:00:00Z",
  "venue": "Convention Center",
  "address": "123 Market St",
  "city": "San Francisco",
  "state": "CA",
  "country": "US",
  "postalCode": "94102",
  "category": "Technology",
  "capacity": 500,
  "isOnline": false,
  "onlineUrl": null,
  "status": "DRAFT",
  "coverImageUrl": "https://..."
}
```

**Response 201:** Created event object

---

### GET /events/:id
Get event details including ticket types.

**Response 200:** Full event object with ticket types and organizer info

---

### PATCH /events/:id
Update an event.

**Auth:** ORGANIZER (own events) or ADMIN

**Body:** Partial event object (any fields from POST /events)

---

### DELETE /events/:id
Soft-delete (archive) an event.

**Auth:** ORGANIZER (own events) or ADMIN

**Response 204:** No content

---

### POST /events/:id/publish
Publish a draft event.

**Auth:** ORGANIZER role required

**Response 200:** Updated event with status: PUBLISHED

---

### POST /events/:id/cancel
Cancel a published event.

**Auth:** ORGANIZER or ADMIN

**Body:**
```json
{ "reason": "Venue unavailable due to flooding" }
```

---

## Ticket Types Endpoints

### GET /events/:eventId/ticket-types
List ticket types for an event.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Early Bird",
    "description": "Limited early bird pricing",
    "price": 29.99,
    "currency": "USD",
    "quantity": 100,
    "sold": 67,
    "available": 33,
    "saleStartDate": "2025-01-01T00:00:00Z",
    "saleEndDate": "2025-03-01T00:00:00Z",
    "maxPerOrder": 5,
    "isActive": true
  }
]
```

---

### POST /events/:eventId/ticket-types
Create a ticket type.

**Auth:** ORGANIZER role required

**Body:**
```json
{
  "name": "VIP",
  "description": "Front row seats + meet & greet",
  "price": 199.99,
  "currency": "USD",
  "quantity": 50,
  "saleStartDate": "2025-01-15T00:00:00Z",
  "saleEndDate": "2025-05-30T00:00:00Z",
  "maxPerOrder": 2
}
```

---

### PATCH /events/:eventId/ticket-types/:id
Update a ticket type.

**Auth:** ORGANIZER role required

---

### DELETE /events/:eventId/ticket-types/:id
Delete a ticket type (only if no tickets sold).

**Auth:** ORGANIZER role required

---

## Orders Endpoints

### GET /orders
List the current user's orders.

**Auth:** Bearer token required

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "CONFIRMED",
      "total": 99.98,
      "currency": "USD",
      "event": { "id": "uuid", "title": "Tech Conference 2025", "startDate": "..." },
      "tickets": [
        { "id": "uuid", "status": "ACTIVE", "ticketType": "General" }
      ],
      "payment": { "method": "STRIPE", "status": "COMPLETED" },
      "createdAt": "2025-01-10T14:30:00Z"
    }
  ],
  "meta": { "total": 5, "page": 1 }
}
```

---

### POST /orders/checkout
Create a new order and initiate payment.

**Auth:** Bearer token required

**Body:**
```json
{
  "items": [
    {
      "ticketTypeId": "uuid",
      "quantity": 2
    }
  ],
  "paymentMethod": "STRIPE"
}
```

**Response 201:**
```json
{
  "orderId": "uuid",
  "clientSecret": "pi_xxx_secret_xxx",
  "total": 99.98,
  "currency": "USD"
}
```

---

### GET /orders/:id
Get order details with tickets.

**Auth:** Bearer token (own orders) or ADMIN

---

### POST /orders/:id/cancel
Cancel an order (if cancellable).

**Auth:** Bearer token (own orders) or ADMIN

---

## Tickets Endpoints

### GET /tickets
List current user's tickets.

**Auth:** Bearer token required

**Query:** `eventId`, `status`, `page`, `limit`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "ACTIVE",
      "ticketCode": "ABCD-EFGH-IJKL",
      "ticketType": { "name": "General", "event": { "title": "...", "startDate": "..." } },
      "holder": { "name": "John Doe", "email": "john@example.com" },
      "issuedAt": "2025-01-10T14:35:00Z"
    }
  ]
}
```

---

### GET /tickets/:id
Get a single ticket with full details.

**Auth:** Bearer token (own ticket) or CONTROLLER/ADMIN

---

### GET /tickets/:id/qr
Get the QR code image for a ticket.

**Auth:** Bearer token (own ticket)

**Response 200:** PNG image (Content-Type: image/png)

---

### GET /tickets/:id/qr-data
Get the raw QR payload data.

**Auth:** Bearer token (own ticket)

**Response 200:**
```json
{
  "qrData": "base64url-encoded-signed-payload",
  "expiresAt": "2025-06-01T23:59:59Z"
}
```

---

### POST /tickets/scan
Validate a ticket by scanning its QR code.

**Auth:** CONTROLLER role required

**Rate limit:** 30 requests/minute per IP

**Body:**
```json
{
  "qrData": "base64url-encoded-signed-payload",
  "eventId": "uuid"
}
```

**Response 200 (valid):**
```json
{
  "valid": true,
  "ticket": {
    "id": "uuid",
    "ticketCode": "ABCD-EFGH-IJKL",
    "ticketType": "General",
    "holder": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "photoUrl": null
    },
    "scannedAt": "2025-06-01T10:15:32Z"
  }
}
```

**Response 200 (invalid):**
```json
{
  "valid": false,
  "reason": "ALREADY_USED",
  "usedAt": "2025-06-01T09:45:00Z"
}
```

**Reason codes:** `ALREADY_USED`, `WRONG_EVENT`, `EXPIRED`, `CANCELLED`, `INVALID_SIGNATURE`, `NOT_FOUND`

---

### POST /tickets/:id/transfer
Transfer a ticket to another user.

**Auth:** Bearer token (own ticket)

**Body:**
```json
{ "recipientEmail": "friend@example.com" }
```

---

## Controllers Endpoints

### GET /events/:eventId/controllers
List controllers assigned to an event.

**Auth:** ORGANIZER (own event) or ADMIN

---

### POST /events/:eventId/controllers
Assign a controller to an event.

**Auth:** ORGANIZER (own event) or ADMIN

**Body:**
```json
{ "userId": "uuid" }
```

---

### DELETE /events/:eventId/controllers/:userId
Remove a controller from an event.

**Auth:** ORGANIZER (own event) or ADMIN

---

## Users Endpoints

### GET /users/me
Get the current authenticated user's profile.

**Auth:** Bearer token required

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "ATTENDEE",
  "avatarUrl": null,
  "twoFactorEnabled": false,
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-10T00:00:00Z"
}
```

---

### PATCH /users/me
Update the current user's profile.

**Auth:** Bearer token required

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "avatarUrl": "https://..."
}
```

---

### PATCH /users/me/password
Change the current user's password.

**Auth:** Bearer token required

**Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

---

## Admin Endpoints

### GET /admin/users
List all users.

**Auth:** ADMIN or SUPER_ADMIN role required

**Query:** `page`, `limit`, `role`, `search`

---

### PATCH /admin/users/:id/role
Change a user's role.

**Auth:** SUPER_ADMIN role required

**Body:**
```json
{ "role": "ORGANIZER" }
```

---

### GET /admin/events
List all events (including drafts).

**Auth:** ADMIN role required

---

### POST /admin/events/:id/feature
Feature an event on the homepage.

**Auth:** ADMIN role required

---

## Analytics Endpoints

### GET /analytics/events/:eventId
Get analytics for a specific event.

**Auth:** ORGANIZER (own event) or ADMIN

**Response 200:**
```json
{
  "event": { "id": "uuid", "title": "Tech Conference 2025" },
  "summary": {
    "totalTicketsSold": 342,
    "totalRevenue": 17055.58,
    "totalScanned": 287,
    "attendanceRate": 83.9,
    "ticketsRemaining": 158
  },
  "ticketTypeBreakdown": [
    {
      "name": "Early Bird",
      "sold": 100,
      "revenue": 2999.00,
      "scanned": 95
    },
    {
      "name": "General",
      "sold": 242,
      "revenue": 12058.58,
      "scanned": 192
    }
  ],
  "salesOverTime": [
    { "date": "2025-01-01", "tickets": 15, "revenue": 747.00 }
  ],
  "scanTimeline": [
    { "time": "09:00", "scans": 45 },
    { "time": "09:15", "scans": 82 }
  ]
}
```

---

### GET /analytics/dashboard
Get organizer's overall dashboard analytics.

**Auth:** ORGANIZER or ADMIN role required

**Response 200:**
```json
{
  "totalEvents": 12,
  "activeEvents": 3,
  "totalTicketsSold": 2847,
  "totalRevenue": 142350.00,
  "recentEvents": [...],
  "revenueByMonth": [...]
}
```

---

## WebSocket Events

Connect to the WebSocket server at `wss://yourdomain.com/socket.io`

### Authentication
Include the access token in the handshake:
```javascript
const socket = io('wss://yourdomain.com', {
  auth: { token: 'Bearer eyJhbGci...' }
});
```

### Client -> Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:event` | `{ eventId: string }` | Subscribe to live event updates |
| `unsubscribe:event` | `{ eventId: string }` | Unsubscribe from event |
| `controller:join` | `{ eventId: string }` | Join as controller for live scan feed |

### Server -> Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ticket:scanned` | `{ ticketId, holderName, scannedAt }` | Ticket was scanned (to controller room) |
| `event:stats` | `{ scanned, total, attendanceRate }` | Live attendance stats update |
| `ticket:sold` | `{ ticketTypeId, remaining }` | Ticket sold (stock update) |
| `order:confirmed` | `{ orderId, ticketIds }` | Sent to the purchasing user |
| `notification` | `{ type, title, message }` | In-app notification |

---

## Error Format

All errors follow this structure:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "must be a valid email address" }
  ],
  "timestamp": "2025-01-10T14:30:00Z",
  "path": "/api/v1/auth/register"
}
```

## Rate Limits

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Auth endpoints | 10 requests | 1 minute |
| General API | 100 requests | 1 minute |
| Ticket scanning | 30 requests | 1 minute |
| File uploads | 10 requests | 1 minute |

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704153600
```
