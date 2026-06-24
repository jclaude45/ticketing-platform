# Ticketing Platform - Database Schema

## Entity Overview

| Table | Description |
|-------|-------------|
| `users` | User accounts (all roles) |
| `events` | Ticketed events |
| `ticket_types` | Price tiers/categories per event |
| `orders` | Purchase transactions |
| `order_items` | Line items within an order |
| `tickets` | Individual issued tickets |
| `payments` | Payment records |
| `event_controllers` | Controller-to-event assignments |
| `notifications` | In-app and email notifications |
| `audit_logs` | Security audit trail |
| `refresh_tokens` | Active refresh token tracking |
| `password_resets` | Password reset tokens |
| `two_factor_secrets` | TOTP secrets per user |

---

## Enum Values

### `user_role`
| Value | Description |
|-------|-------------|
| `SUPER_ADMIN` | Platform-wide administrator |
| `ADMIN` | Content/user administrator |
| `ORGANIZER` | Can create and manage events |
| `CONTROLLER` | Can scan tickets at events |
| `ATTENDEE` | Default role, can purchase tickets |

### `event_status`
| Value | Description |
|-------|-------------|
| `DRAFT` | Not visible to public |
| `PUBLISHED` | Visible and tickets on sale |
| `CANCELLED` | Event cancelled |
| `COMPLETED` | Event has passed |
| `ARCHIVED` | Soft-deleted |

### `ticket_status`
| Value | Description |
|-------|-------------|
| `ACTIVE` | Valid and unused |
| `USED` | Scanned at event entry |
| `CANCELLED` | Cancelled/refunded |
| `EXPIRED` | Past event date, not used |
| `TRANSFERRED` | Transferred to new owner |

### `order_status`
| Value | Description |
|-------|-------------|
| `PENDING` | Awaiting payment |
| `CONFIRMED` | Payment confirmed, tickets issued |
| `CANCELLED` | Order cancelled |
| `REFUNDED` | Full refund processed |
| `PARTIALLY_REFUNDED` | Partial refund processed |

### `payment_status`
| Value | Description |
|-------|-------------|
| `PENDING` | Awaiting processing |
| `PROCESSING` | Payment being processed |
| `COMPLETED` | Successfully charged |
| `FAILED` | Payment failed |
| `REFUNDED` | Refund completed |

### `payment_method`
| Value | Description |
|-------|-------------|
| `CREDIT_CARD` | Credit card via Stripe |
| `DEBIT_CARD` | Debit card via Stripe |
| `STRIPE` | Generic Stripe payment |
| `PAYPAL` | PayPal payment |
| `FREE` | Free event/ticket |

### `notification_type`
| Value | Description |
|-------|-------------|
| `TICKET_PURCHASE` | Ticket purchased successfully |
| `EVENT_REMINDER` | Upcoming event reminder |
| `EVENT_CANCELLED` | Event was cancelled |
| `TICKET_TRANSFERRED` | Ticket transferred |
| `ACCOUNT_ACTIVITY` | Account security event |
| `SYSTEM` | System notification |

---

## Table Definitions

### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Email address |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hash |
| `first_name` | VARCHAR(100) | NOT NULL | First name |
| `last_name` | VARCHAR(100) | NOT NULL | Last name |
| `role` | user_role | NOT NULL, DEFAULT 'ATTENDEE' | User role |
| `avatar_url` | TEXT | NULL | Profile photo URL |
| `phone` | VARCHAR(30) | NULL | Phone number |
| `email_verified` | BOOLEAN | DEFAULT false | Email verification status |
| `email_verified_at` | TIMESTAMPTZ | NULL | When email was verified |
| `is_active` | BOOLEAN | DEFAULT true | Account active status |
| `last_login_at` | TIMESTAMPTZ | NULL | Last successful login |
| `failed_login_attempts` | INT | DEFAULT 0 | Consecutive failed logins |
| `locked_until` | TIMESTAMPTZ | NULL | Account lock expiry |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_users_email` ON (email)
- `idx_users_role` ON (role)
- `idx_users_created_at` ON (created_at DESC)

---

### `events`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `organizer_id` | UUID | FK -> users(id), NOT NULL | Event organizer |
| `title` | VARCHAR(255) | NOT NULL | Event title |
| `slug` | VARCHAR(255) | UNIQUE, NOT NULL | URL-friendly slug |
| `description` | TEXT | NULL | Full description |
| `short_description` | VARCHAR(500) | NULL | Short summary |
| `status` | event_status | NOT NULL, DEFAULT 'DRAFT' | Current status |
| `category` | VARCHAR(100) | NULL | Event category |
| `tags` | TEXT[] | DEFAULT '{}' | Searchable tags |
| `start_date` | TIMESTAMPTZ | NOT NULL | Event start |
| `end_date` | TIMESTAMPTZ | NOT NULL | Event end |
| `timezone` | VARCHAR(50) | DEFAULT 'UTC' | IANA timezone |
| `venue` | VARCHAR(255) | NULL | Venue name |
| `address` | VARCHAR(255) | NULL | Street address |
| `city` | VARCHAR(100) | NULL | City |
| `state` | VARCHAR(100) | NULL | State/province |
| `country` | CHAR(2) | NULL | ISO country code |
| `postal_code` | VARCHAR(20) | NULL | Postal/ZIP code |
| `latitude` | DECIMAL(10, 8) | NULL | GPS latitude |
| `longitude` | DECIMAL(11, 8) | NULL | GPS longitude |
| `is_online` | BOOLEAN | DEFAULT false | Online event flag |
| `online_url` | TEXT | NULL | Online event URL |
| `capacity` | INT | NULL | Max total capacity |
| `cover_image_url` | TEXT | NULL | Cover image |
| `gallery_urls` | TEXT[] | DEFAULT '{}' | Gallery images |
| `is_featured` | BOOLEAN | DEFAULT false | Featured on homepage |
| `cancellation_reason` | TEXT | NULL | Reason if cancelled |
| `cancelled_at` | TIMESTAMPTZ | NULL | Cancellation timestamp |
| `published_at` | TIMESTAMPTZ | NULL | Publication timestamp |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_events_organizer_id` ON (organizer_id)
- `idx_events_status` ON (status)
- `idx_events_start_date` ON (start_date)
- `idx_events_city_country` ON (city, country)
- `idx_events_slug` ON (slug) [UNIQUE]
- `idx_events_search` GIN ON (to_tsvector('english', title || ' ' || COALESCE(description, '')))

**Foreign Keys:**
- `organizer_id` -> `users(id)` ON DELETE RESTRICT

---

### `ticket_types`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `event_id` | UUID | FK -> events(id), NOT NULL | Parent event |
| `name` | VARCHAR(100) | NOT NULL | Ticket type name |
| `description` | TEXT | NULL | Description |
| `price` | DECIMAL(10, 2) | NOT NULL, DEFAULT 0 | Price |
| `currency` | CHAR(3) | NOT NULL, DEFAULT 'USD' | ISO currency code |
| `quantity` | INT | NOT NULL | Total quantity available |
| `sold` | INT | NOT NULL, DEFAULT 0 | Tickets sold count |
| `sale_start_date` | TIMESTAMPTZ | NULL | When sales begin |
| `sale_end_date` | TIMESTAMPTZ | NULL | When sales end |
| `max_per_order` | INT | DEFAULT 10 | Max per single order |
| `min_per_order` | INT | DEFAULT 1 | Min per single order |
| `is_active` | BOOLEAN | DEFAULT true | Whether on sale |
| `position` | INT | DEFAULT 0 | Display order |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Computed:** `available = quantity - sold`

**Indexes:**
- `idx_ticket_types_event_id` ON (event_id)
- `idx_ticket_types_active` ON (event_id, is_active)

**Foreign Keys:**
- `event_id` -> `events(id)` ON DELETE CASCADE

**Constraints:**
- `CHECK (price >= 0)`
- `CHECK (quantity >= 0)`
- `CHECK (sold >= 0)`
- `CHECK (sold <= quantity)`

---

### `orders`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `user_id` | UUID | FK -> users(id), NOT NULL | Purchaser |
| `event_id` | UUID | FK -> events(id), NOT NULL | Event being ordered for |
| `order_number` | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable order # |
| `status` | order_status | NOT NULL, DEFAULT 'PENDING' | Order status |
| `subtotal` | DECIMAL(10, 2) | NOT NULL | Before fees/discounts |
| `fees` | DECIMAL(10, 2) | DEFAULT 0 | Platform/processing fees |
| `discount` | DECIMAL(10, 2) | DEFAULT 0 | Discount amount |
| `total` | DECIMAL(10, 2) | NOT NULL | Final amount charged |
| `currency` | CHAR(3) | NOT NULL, DEFAULT 'USD' | Currency |
| `notes` | TEXT | NULL | Customer notes |
| `ip_address` | INET | NULL | Purchase IP address |
| `user_agent` | TEXT | NULL | Browser user agent |
| `expires_at` | TIMESTAMPTZ | NULL | Order expiry (pending) |
| `confirmed_at` | TIMESTAMPTZ | NULL | Payment confirmed |
| `cancelled_at` | TIMESTAMPTZ | NULL | Cancellation time |
| `refunded_at` | TIMESTAMPTZ | NULL | Refund processed |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_orders_user_id` ON (user_id)
- `idx_orders_event_id` ON (event_id)
- `idx_orders_status` ON (status)
- `idx_orders_order_number` ON (order_number) [UNIQUE]
- `idx_orders_created_at` ON (created_at DESC)

**Foreign Keys:**
- `user_id` -> `users(id)` ON DELETE RESTRICT
- `event_id` -> `events(id)` ON DELETE RESTRICT

---

### `order_items`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `order_id` | UUID | FK -> orders(id), NOT NULL | Parent order |
| `ticket_type_id` | UUID | FK -> ticket_types(id), NOT NULL | Ticket type |
| `quantity` | INT | NOT NULL | Quantity ordered |
| `unit_price` | DECIMAL(10, 2) | NOT NULL | Price at time of purchase |
| `subtotal` | DECIMAL(10, 2) | NOT NULL | quantity * unit_price |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Foreign Keys:**
- `order_id` -> `orders(id)` ON DELETE CASCADE
- `ticket_type_id` -> `ticket_types(id)` ON DELETE RESTRICT

---

### `tickets`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `order_id` | UUID | FK -> orders(id), NOT NULL | Source order |
| `order_item_id` | UUID | FK -> order_items(id), NOT NULL | Source order item |
| `ticket_type_id` | UUID | FK -> ticket_types(id), NOT NULL | Ticket type |
| `event_id` | UUID | FK -> events(id), NOT NULL | Event (denormalized) |
| `holder_id` | UUID | FK -> users(id), NOT NULL | Current ticket holder |
| `original_owner_id` | UUID | FK -> users(id), NOT NULL | Original purchaser |
| `ticket_code` | VARCHAR(15) | UNIQUE, NOT NULL | Human-readable code |
| `status` | ticket_status | NOT NULL, DEFAULT 'ACTIVE' | Ticket status |
| `qr_data` | TEXT | NOT NULL | RSA-signed QR payload |
| `qr_nonce` | UUID | NOT NULL, DEFAULT uuid_generate_v4() | Anti-replay nonce |
| `scanned_at` | TIMESTAMPTZ | NULL | Scan timestamp |
| `scanned_by` | UUID | FK -> users(id), NULL | Controller who scanned |
| `scan_location` | VARCHAR(100) | NULL | Entry gate/location |
| `transferred_at` | TIMESTAMPTZ | NULL | Transfer timestamp |
| `transferred_from` | UUID | FK -> users(id), NULL | Previous holder |
| `cancelled_at` | TIMESTAMPTZ | NULL | Cancellation timestamp |
| `expires_at` | TIMESTAMPTZ | NULL | Optional expiry |
| `issued_at` | TIMESTAMPTZ | DEFAULT NOW() | Issue timestamp |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_tickets_order_id` ON (order_id)
- `idx_tickets_holder_id` ON (holder_id)
- `idx_tickets_event_id` ON (event_id)
- `idx_tickets_status` ON (status)
- `idx_tickets_ticket_code` ON (ticket_code) [UNIQUE]
- `idx_tickets_qr_nonce` ON (qr_nonce) [UNIQUE]

---

### `payments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `order_id` | UUID | FK -> orders(id), UNIQUE, NOT NULL | Associated order |
| `status` | payment_status | NOT NULL, DEFAULT 'PENDING' | Payment status |
| `method` | payment_method | NOT NULL | Payment method |
| `amount` | DECIMAL(10, 2) | NOT NULL | Amount charged |
| `currency` | CHAR(3) | NOT NULL | Currency |
| `provider_payment_id` | VARCHAR(255) | NULL | Stripe PaymentIntent ID etc. |
| `provider_customer_id` | VARCHAR(255) | NULL | Stripe Customer ID etc. |
| `refund_amount` | DECIMAL(10, 2) | DEFAULT 0 | Refunded amount |
| `refund_id` | VARCHAR(255) | NULL | Provider refund ID |
| `error_message` | TEXT | NULL | Payment failure reason |
| `metadata` | JSONB | DEFAULT '{}' | Provider-specific metadata |
| `processed_at` | TIMESTAMPTZ | NULL | Payment success timestamp |
| `refunded_at` | TIMESTAMPTZ | NULL | Refund timestamp |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_payments_order_id` ON (order_id) [UNIQUE]
- `idx_payments_provider_payment_id` ON (provider_payment_id)
- `idx_payments_status` ON (status)

---

### `event_controllers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | UUID | FK -> events(id), NOT NULL | Event |
| `user_id` | UUID | FK -> users(id), NOT NULL | Controller user |
| `assigned_by` | UUID | FK -> users(id), NOT NULL | Who assigned them |
| `assigned_at` | TIMESTAMPTZ | DEFAULT NOW() | Assignment timestamp |
| `gate` | VARCHAR(100) | NULL | Assigned gate/entrance |

**Primary Key:** (event_id, user_id)

---

### `notifications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `user_id` | UUID | FK -> users(id), NOT NULL | Recipient |
| `type` | notification_type | NOT NULL | Notification type |
| `title` | VARCHAR(255) | NOT NULL | Short title |
| `message` | TEXT | NOT NULL | Full message |
| `data` | JSONB | DEFAULT '{}' | Additional data (orderId, etc.) |
| `is_read` | BOOLEAN | DEFAULT false | Read status |
| `read_at` | TIMESTAMPTZ | NULL | When read |
| `email_sent` | BOOLEAN | DEFAULT false | Email sent flag |
| `email_sent_at` | TIMESTAMPTZ | NULL | When email sent |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- `idx_notifications_user_id` ON (user_id)
- `idx_notifications_unread` ON (user_id, is_read) WHERE is_read = false
- `idx_notifications_created_at` ON (created_at DESC)

---

### `refresh_tokens`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `user_id` | UUID | FK -> users(id), NOT NULL | Token owner |
| `token_hash` | VARCHAR(255) | UNIQUE, NOT NULL | SHA-256 hash of token |
| `is_revoked` | BOOLEAN | DEFAULT false | Revocation status |
| `device_info` | TEXT | NULL | User agent / device |
| `ip_address` | INET | NULL | IP when issued |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Token expiry |
| `revoked_at` | TIMESTAMPTZ | NULL | When revoked |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Issue timestamp |

**Indexes:**
- `idx_refresh_tokens_user_id` ON (user_id)
- `idx_refresh_tokens_token_hash` ON (token_hash) [UNIQUE]
- `idx_refresh_tokens_expires_at` ON (expires_at)

---

### `audit_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Primary key |
| `user_id` | UUID | NULL | Acting user (null for system) |
| `action` | VARCHAR(100) | NOT NULL | Action performed |
| `resource_type` | VARCHAR(50) | NULL | Resource type (ticket, order, etc.) |
| `resource_id` | UUID | NULL | Resource ID |
| `old_value` | JSONB | NULL | Previous state |
| `new_value` | JSONB | NULL | New state |
| `ip_address` | INET | NULL | Request IP |
| `user_agent` | TEXT | NULL | Browser info |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Event timestamp |

**Indexes:**
- `idx_audit_logs_user_id` ON (user_id)
- `idx_audit_logs_resource` ON (resource_type, resource_id)
- `idx_audit_logs_action` ON (action)
- `idx_audit_logs_created_at` ON (created_at DESC)

*Audit logs are append-only. No updates or deletes.*

---

## Key Relationships (ERD)

```
users (1) ----< orders (many)
users (1) ----< tickets as holder (many)
users (1) ----< event_controllers (many)

events (1) ----< ticket_types (many)
events (1) ----< orders (many)
events (1) ----< event_controllers (many)

orders (1) ----< order_items (many)
orders (1) ---1 payments
orders (1) ----< tickets (many)

order_items (many) >---- ticket_types (1)
tickets (many) >---- ticket_types (1)
tickets (many) >---- events (1)
```

## Notes on Data Integrity

1. **Ticket Stock Control:** `ticket_types.sold` is incremented atomically in a transaction alongside `tickets` row insertion. Row-level locking (`SELECT FOR UPDATE`) prevents overselling.

2. **QR Nonce:** Each ticket has a unique `qr_nonce` embedded in the signed payload. Even if a QR screenshot is captured, the nonce check + status update is atomic.

3. **Soft Deletes:** Events and users are never hard-deleted. Events use `status = ARCHIVED`, users use `is_active = false`.

4. **Audit Trail:** All security-sensitive operations (login, password reset, ticket scan, role change) create `audit_logs` records.

5. **Currency:** All monetary values are stored as `DECIMAL(10, 2)` to avoid floating-point errors. Currency code stored alongside for multi-currency support.
