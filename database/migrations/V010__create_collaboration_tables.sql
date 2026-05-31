-- =============================================================
-- V010__create_collaboration_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Comments and notifications
-- =============================================================

-- ── comments ─────────────────────────────────────────────────
-- Threaded comments on any entity (person, event, media, etc.)
CREATE TABLE comments (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    author_id           uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    -- Polymorphic target
    entity_type         text            NOT NULL,
    entity_id           uuid            NOT NULL,

    -- Threading: NULL = top-level comment
    parent_comment_id   uuid            REFERENCES comments (id) ON DELETE CASCADE,

    body                text            NOT NULL,
    is_deleted          boolean         NOT NULL DEFAULT false,  -- soft delete

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT comments_body_length
        CHECK (char_length(body) BETWEEN 1 AND 5000),
    CONSTRAINT comments_entity_type_values
        CHECK (entity_type IN (
            'person','family_group','event','media','tree'
        ))
);

CREATE INDEX idx_comments_entity    ON comments (tenant_id, entity_type, entity_id)
    WHERE is_deleted = false;
CREATE INDEX idx_comments_author    ON comments (tenant_id, author_id);
CREATE INDEX idx_comments_thread    ON comments (parent_comment_id)
    WHERE parent_comment_id IS NOT NULL;

-- ── notifications ─────────────────────────────────────────────
-- In-app notifications dispatched by Celery workers.
-- Partitioned by created_at for large-scale tenants (see V015).
CREATE TABLE notifications (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id             uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    notification_type   text            NOT NULL,
    entity_type         text,
    entity_id           uuid,

    -- Arbitrary payload for the notification renderer
    payload             jsonb           NOT NULL DEFAULT '{}',

    is_read             boolean         NOT NULL DEFAULT false,
    read_at             timestamptz,

    created_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT notif_type_values CHECK (
        notification_type IN (
            'COMMENT_ADDED','PERSON_EDITED','INVITE_RECEIVED',
            'INVITE_ACCEPTED','TREE_SHARED','MEDIA_PROCESSED',
            'IMPORT_COMPLETE','EXPORT_READY','DNA_MATCH_FOUND',
            'COLLABORATOR_JOINED','SYSTEM'
        )
    ),
    CONSTRAINT notif_read_consistent
        CHECK (
            (is_read = false AND read_at IS NULL) OR
            (is_read = true  AND read_at IS NOT NULL)
        )
);

CREATE INDEX idx_notifications_user     ON notifications (tenant_id, user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_unread   ON notifications (tenant_id, user_id)
    WHERE is_read = false;

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
