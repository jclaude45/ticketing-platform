-- =============================================================================
-- Ticketing Platform - Database Initialization Script
-- Runs on first PostgreSQL container startup
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- For fast text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For GIN index support on btree types

-- =============================================================================
-- Enums (created before tables if not using Prisma migrations)
-- =============================================================================

-- User roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'ORGANIZER', 'CONTROLLER', 'ATTENDEE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Event status
DO $$ BEGIN
    CREATE TYPE event_status AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Ticket status
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('ACTIVE', 'USED', 'CANCELLED', 'EXPIRED', 'TRANSFERRED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Order status
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Payment status
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Payment method
DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'STRIPE', 'PAYPAL', 'FREE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Notification type
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('TICKET_PURCHASE', 'EVENT_REMINDER', 'EVENT_CANCELLED', 'TICKET_TRANSFERRED', 'ACCOUNT_ACTIVITY', 'SYSTEM');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Core Functions
-- =============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate a short unique code for tickets
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..12 LOOP
        result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
        IF i IN (4, 8) THEN
            result := result || '-';
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Schema Comment
-- =============================================================================
COMMENT ON DATABASE ticketing_db IS 'Ticketing Platform - Main database';

-- =============================================================================
-- Initial Configuration Check
-- Verify extensions are loaded correctly
-- =============================================================================
DO $$
DECLARE
    ext_record RECORD;
BEGIN
    FOR ext_record IN
        SELECT extname FROM pg_extension
        WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'btree_gin')
    LOOP
        RAISE NOTICE 'Extension loaded: %', ext_record.extname;
    END LOOP;
END $$;

-- =============================================================================
-- Performance Settings (session-level)
-- =============================================================================
-- These are suggestions; actual values should be set in postgresql.conf
-- ALTER SYSTEM SET shared_buffers = '256MB';
-- ALTER SYSTEM SET effective_cache_size = '1GB';
-- ALTER SYSTEM SET maintenance_work_mem = '64MB';
-- ALTER SYSTEM SET checkpoint_completion_target = '0.9';
-- ALTER SYSTEM SET wal_buffers = '16MB';
-- ALTER SYSTEM SET default_statistics_target = '100';
-- ALTER SYSTEM SET random_page_cost = '1.1';
-- SELECT pg_reload_conf();

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Ticketing Platform database initialized successfully';
    RAISE NOTICE 'Extensions: uuid-ossp, pgcrypto, pg_trgm, btree_gin';
    RAISE NOTICE 'Enums: user_role, event_status, ticket_status, order_status, payment_status, payment_method, notification_type';
    RAISE NOTICE 'Functions: trigger_set_timestamp, generate_ticket_code';
    RAISE NOTICE '=================================================';
END $$;
