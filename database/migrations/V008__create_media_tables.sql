-- =============================================================
-- V008__create_media_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Media (photos, documents, audio, video) and attachments
-- =============================================================

-- ── media ─────────────────────────────────────────────────────
CREATE TABLE media (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id             uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
    uploaded_by         uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    media_type          media_type      NOT NULL,
    original_filename   text            NOT NULL,

    -- S3-compatible storage keys
    storage_key         text            NOT NULL,       -- original file
    thumbnail_key       text,                           -- generated thumbnail

    -- Processed variants stored as JSONB array:
    -- [{"size": "800w", "key": "...", "width": 800, "height": 600}, ...]
    variants            jsonb           NOT NULL DEFAULT '[]',

    file_size_bytes     bigint          NOT NULL,
    mime_type           text            NOT NULL,

    -- Perceptual hash for duplicate detection (pHash)
    perceptual_hash     text,

    -- Image dimensions (NULL for non-image media)
    width_px            integer,
    height_px           integer,

    -- Processing pipeline state
    status              media_status    NOT NULL DEFAULT 'PENDING',
    processing_error    text,

    -- Soft delete: file stays in S3 until background job cleans up
    is_deleted          boolean         NOT NULL DEFAULT false,
    deleted_at          timestamptz,

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT media_file_size_positive
        CHECK (file_size_bytes > 0),
    CONSTRAINT media_dimensions_consistent
        CHECK (
            (width_px IS NULL AND height_px IS NULL) OR
            (width_px IS NOT NULL AND height_px IS NOT NULL)
        ),
    CONSTRAINT media_dimensions_positive
        CHECK (
            width_px IS NULL OR
            (width_px > 0 AND height_px > 0)
        ),
    CONSTRAINT media_deleted_consistent
        CHECK (
            (is_deleted = false AND deleted_at IS NULL) OR
            (is_deleted = true  AND deleted_at IS NOT NULL)
        )
);

CREATE INDEX idx_media_tenant_tree      ON media (tenant_id, tree_id);
CREATE INDEX idx_media_uploader         ON media (tenant_id, uploaded_by);
CREATE INDEX idx_media_type             ON media (tenant_id, media_type);
CREATE INDEX idx_media_status           ON media (status)
    WHERE status IN ('PENDING','PROCESSING');
CREATE INDEX idx_media_active           ON media (tenant_id, tree_id)
    WHERE is_deleted = false;
-- Partial index: perceptual hash lookup for duplicate detection
CREATE INDEX idx_media_phash            ON media (perceptual_hash)
    WHERE perceptual_hash IS NOT NULL AND is_deleted = false;

-- ── media_attachments ─────────────────────────────────────────
-- Polymorphic: attaches a media item to any entity.
-- face_region: optional bounding box for face tags
--   {"x": 0.1, "y": 0.05, "width": 0.2, "height": 0.3} (normalised 0-1)
CREATE TABLE media_attachments (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    media_id        uuid            NOT NULL REFERENCES media (id) ON DELETE CASCADE,

    -- Polymorphic reference
    entity_type     text            NOT NULL,
    entity_id       uuid            NOT NULL,

    caption         text,
    face_region     jsonb,          -- bounding box for tagged persons
    sort_order      integer         NOT NULL DEFAULT 0,

    created_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT ma_entity_type_values
        CHECK (entity_type IN (
            'person','family_group','event','tree'
        )),
    CONSTRAINT uq_media_attachment
        UNIQUE (media_id, entity_type, entity_id)
);

CREATE INDEX idx_ma_media           ON media_attachments (tenant_id, media_id);
CREATE INDEX idx_ma_entity          ON media_attachments (entity_type, entity_id);
CREATE INDEX idx_ma_tenant_entity   ON media_attachments (tenant_id, entity_type, entity_id);

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER trg_media_updated_at
    BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
