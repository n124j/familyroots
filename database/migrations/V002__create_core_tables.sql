-- =============================================================
-- V002__create_core_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Core: tenants, users, oauth_providers, subscriptions
-- =============================================================

-- ── Extension prerequisites ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── tenants ───────────────────────────────────────────────────
CREATE TABLE tenants (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text            NOT NULL,
    name            text            NOT NULL,
    plan            subscription_plan NOT NULL DEFAULT 'FREE',
    is_active       boolean         NOT NULL DEFAULT true,
    settings        jsonb           NOT NULL DEFAULT '{}',
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT tenants_slug_format
        CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$')
);

CREATE UNIQUE INDEX uq_tenants_slug ON tenants (slug);

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE users (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email           text            NOT NULL,
    password_hash   text,                           -- NULL for OAuth-only accounts
    display_name    text            NOT NULL,
    avatar_url      text,
    locale          text            NOT NULL DEFAULT 'en',
    timezone        text            NOT NULL DEFAULT 'UTC',
    is_verified     boolean         NOT NULL DEFAULT false,
    is_active       boolean         NOT NULL DEFAULT true,
    failed_login_attempts int       NOT NULL DEFAULT 0,
    locked_until    timestamptz,
    last_login_at   timestamptz,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT users_email_format
        CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_display_name_length
        CHECK (char_length(display_name) BETWEEN 1 AND 100),
    CONSTRAINT users_failed_attempts_positive
        CHECK (failed_login_attempts >= 0)
);

-- One email per tenant (supports multi-tenant SaaS where same email can join multiple tenants)
CREATE UNIQUE INDEX uq_users_tenant_email ON users (tenant_id, email);
CREATE INDEX idx_users_tenant_id        ON users (tenant_id);
CREATE INDEX idx_users_last_login       ON users (tenant_id, last_login_at DESC);

-- ── user_oauth_providers ──────────────────────────────────────
CREATE TABLE user_oauth_providers (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider            text        NOT NULL,        -- 'google' | 'facebook' | 'apple'
    provider_user_id    text        NOT NULL,
    access_token_hash   text,                        -- hashed, not stored plaintext
    refresh_token_hash  text,
    token_expires_at    timestamptz,
    profile_data        jsonb       NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT oauth_provider_values
        CHECK (provider IN ('google','facebook','apple','github'))
);

CREATE UNIQUE INDEX uq_oauth_provider_user
    ON user_oauth_providers (provider, provider_user_id);
CREATE INDEX idx_oauth_user_id
    ON user_oauth_providers (tenant_id, user_id);

-- ── subscriptions ─────────────────────────────────────────────
CREATE TABLE subscriptions (
    id                      uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id                 uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    plan                    subscription_plan NOT NULL,
    status                  text            NOT NULL DEFAULT 'active',
    stripe_customer_id      text,
    stripe_subscription_id  text,
    current_period_start    timestamptz,
    current_period_end      timestamptz,
    cancel_at_period_end    boolean         NOT NULL DEFAULT false,
    cancelled_at            timestamptz,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_at              timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT subscription_status_values
        CHECK (status IN ('active','past_due','cancelled','trialing','paused')),
    CONSTRAINT subscription_period_order
        CHECK (current_period_end IS NULL OR current_period_end > current_period_start)
);

CREATE UNIQUE INDEX uq_subscription_user
    ON subscriptions (tenant_id, user_id)
    WHERE status = 'active';
CREATE INDEX idx_subscriptions_stripe
    ON subscriptions (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

-- ── updated_at trigger function (shared) ─────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oauth_updated_at
    BEFORE UPDATE ON user_oauth_providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
