-- =============================================================
-- V003__create_tree_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Trees, collaborators, invitations
-- =============================================================

-- ── trees ─────────────────────────────────────────────────────
CREATE TABLE trees (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    owner_id        uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    name            text            NOT NULL,
    description     text,
    is_public       boolean         NOT NULL DEFAULT false,
    privacy_level   privacy_level   NOT NULL DEFAULT 'FAMILY',
    person_count    integer         NOT NULL DEFAULT 0,
    gedcom_header   jsonb           NOT NULL DEFAULT '{}',   -- GEDCOM HEAD metadata
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT trees_name_length
        CHECK (char_length(name) BETWEEN 1 AND 200),
    CONSTRAINT trees_person_count_positive
        CHECK (person_count >= 0)
);

CREATE INDEX idx_trees_tenant_id    ON trees (tenant_id);
CREATE INDEX idx_trees_owner_id     ON trees (tenant_id, owner_id);
CREATE INDEX idx_trees_public       ON trees (is_public) WHERE is_public = true;

-- ── tree_collaborators ────────────────────────────────────────
CREATE TABLE tree_collaborators (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id         uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
    user_id         uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            collaborator_role NOT NULL DEFAULT 'VIEWER',
    granted_at      timestamptz     NOT NULL DEFAULT now(),
    granted_by      uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    CONSTRAINT uq_tree_collaborator UNIQUE (tree_id, user_id)
);

CREATE INDEX idx_collaborators_tree    ON tree_collaborators (tenant_id, tree_id);
CREATE INDEX idx_collaborators_user    ON tree_collaborators (tenant_id, user_id);

-- ── invitations ───────────────────────────────────────────────
CREATE TABLE invitations (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id         uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
    invited_by      uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    email           text            NOT NULL,
    role            collaborator_role NOT NULL DEFAULT 'VIEWER',
    token           text            NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    status          invitation_status NOT NULL DEFAULT 'PENDING',
    expires_at      timestamptz     NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    accepted_at     timestamptz,
    created_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT invitations_expiry_future
        CHECK (expires_at > created_at),
    CONSTRAINT invitations_accepted_after_created
        CHECK (accepted_at IS NULL OR accepted_at >= created_at),
    CONSTRAINT invitations_email_format
        CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE UNIQUE INDEX uq_invitation_token     ON invitations (token);
CREATE UNIQUE INDEX uq_invitation_pending
    ON invitations (tree_id, email)
    WHERE status = 'PENDING';
CREATE INDEX idx_invitations_tree          ON invitations (tenant_id, tree_id);
CREATE INDEX idx_invitations_email         ON invitations (email)
    WHERE status = 'PENDING';

-- ── updated_at triggers ───────────────────────────────────────
CREATE TRIGGER trg_trees_updated_at
    BEFORE UPDATE ON trees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
