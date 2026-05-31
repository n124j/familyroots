-- =============================================================
-- V015__row_level_security.sql
-- FamilyRoots · PostgreSQL 15
-- PostgreSQL Row-Level Security (RLS)
--
-- Architecture: RLS is the SECOND layer of defence.
-- The application ORM enforces tenant_id on every query (Layer 1).
-- RLS ensures that even a miscoded query or direct DB connection
-- can never leak cross-tenant data (Layer 2).
--
-- Connection pool context:
--   PgBouncer connects as 'app_user' (transaction-pooling mode).
--   The application sets app.current_tenant_id and
--   app.current_user_id via SET LOCAL on each transaction.
-- =============================================================

-- ── Application role ──────────────────────────────────────────
-- In production this role already exists; CREATE IF NOT EXISTS
-- allows the migration to be re-run safely.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_user') THEN
        CREATE ROLE readonly_user LOGIN;
    END IF;
END;
$$;

-- Grant DML to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- audit_log: INSERT only (UPDATE/DELETE prevented by triggers in V014)
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
-- readonly_user: SELECT only
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- ── Helper function: current tenant ──────────────────────────
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- ── Helper function: current user ────────────────────────────
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ─────────────────────────────────────────────────────────────
-- Enable RLS on all multi-tenant tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_oauth_providers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trees                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_collaborators      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_names            ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_group_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships           ENABLE ROW LEVEL SECURITY;
ALTER TABLE places                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_citations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE media                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_attachments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dna_kits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE dna_matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE version_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs             ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES
-- Pattern: USING (tenant_id = current_tenant_id())
-- Superusers and the migration role bypass RLS by default.
-- ─────────────────────────────────────────────────────────────

-- users
CREATE POLICY rls_users ON users
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- user_oauth_providers
CREATE POLICY rls_oauth ON user_oauth_providers
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- subscriptions
CREATE POLICY rls_subscriptions ON subscriptions
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- trees
CREATE POLICY rls_trees ON trees
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- tree_collaborators
CREATE POLICY rls_tree_collaborators ON tree_collaborators
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- invitations
CREATE POLICY rls_invitations ON invitations
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- persons
CREATE POLICY rls_persons ON persons
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- person_names
CREATE POLICY rls_person_names ON person_names
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- family_groups
CREATE POLICY rls_family_groups ON family_groups
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- family_group_members
CREATE POLICY rls_fgm ON family_group_members
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- relationships
CREATE POLICY rls_relationships ON relationships
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- places
CREATE POLICY rls_places ON places
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- events
CREATE POLICY rls_events ON events
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- event_participants
CREATE POLICY rls_event_participants ON event_participants
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- sources
CREATE POLICY rls_sources ON sources
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- source_citations
CREATE POLICY rls_source_citations ON source_citations
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- media
CREATE POLICY rls_media ON media
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- media_attachments
CREATE POLICY rls_media_attachments ON media_attachments
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- dna_kits
CREATE POLICY rls_dna_kits ON dna_kits
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- dna_matches
CREATE POLICY rls_dna_matches ON dna_matches
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- comments
CREATE POLICY rls_comments ON comments
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- notifications: user sees only their own
CREATE POLICY rls_notifications ON notifications
    AS PERMISSIVE FOR ALL TO app_user
    USING (
        tenant_id = current_tenant_id() AND
        user_id   = current_app_user_id()
    );

-- version_history
CREATE POLICY rls_version_history ON version_history
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- audit_log: SELECT only; INSERT by trigger (SECURITY DEFINER bypasses RLS)
CREATE POLICY rls_audit_log ON audit_log
    AS PERMISSIVE FOR SELECT TO app_user
    USING (tenant_id = current_tenant_id());

-- import_jobs
CREATE POLICY rls_import_jobs ON import_jobs
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- export_jobs
CREATE POLICY rls_export_jobs ON export_jobs
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_tenant_id());

-- ── Read-only role policies ───────────────────────────────────
-- Mirrors app_user policies but SELECT-only; used by read replicas.
CREATE POLICY rls_ro_persons ON persons
    AS PERMISSIVE FOR SELECT TO readonly_user
    USING (tenant_id = current_tenant_id());

CREATE POLICY rls_ro_trees ON trees
    AS PERMISSIVE FOR SELECT TO readonly_user
    USING (tenant_id = current_tenant_id());

CREATE POLICY rls_ro_events ON events
    AS PERMISSIVE FOR SELECT TO readonly_user
    USING (tenant_id = current_tenant_id());
