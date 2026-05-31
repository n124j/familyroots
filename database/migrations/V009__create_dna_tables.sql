-- =============================================================
-- V009__create_dna_tables.sql
-- FamilyRoots · PostgreSQL 15
-- DNA kits and match results (future-ready schema)
-- =============================================================

-- ── dna_kits ─────────────────────────────────────────────────
-- Represents a DNA test result uploaded by a user and linked to a person.
CREATE TABLE dna_kits (
    id                      uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    person_id               uuid            NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    uploaded_by             uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    provider                dna_provider    NOT NULL,
    kit_id                  text,           -- provider-assigned kit identifier
    kit_label               text,           -- user-friendly label

    -- Haplogroups (NULL until processed)
    haplogroup_maternal     text,           -- mtDNA haplogroup
    haplogroup_paternal     text,           -- Y-DNA haplogroup (males only)

    -- Raw file storage key (optional — user may upload CSV match file)
    raw_file_key            text,

    is_processed            boolean         NOT NULL DEFAULT false,
    processed_at            timestamptz,

    tested_at               date,           -- date DNA sample was collected
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_at              timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_dna_kits_person    ON dna_kits (tenant_id, person_id);
CREATE INDEX idx_dna_kits_uploader  ON dna_kits (tenant_id, uploaded_by);
CREATE UNIQUE INDEX uq_dna_kit_provider
    ON dna_kits (tenant_id, provider, kit_id)
    WHERE kit_id IS NOT NULL;

-- ── dna_matches ───────────────────────────────────────────────
-- A shared-DNA segment match between two kits.
-- The pair is stored once (kit1_id < kit2_id enforced by check or app logic).
CREATE TABLE dna_matches (
    id                      uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    kit1_id                 uuid            NOT NULL REFERENCES dna_kits (id) ON DELETE CASCADE,
    kit2_id                 uuid            NOT NULL REFERENCES dna_kits (id) ON DELETE CASCADE,

    -- centiMorgan metrics
    shared_cm               numeric(8,2)    NOT NULL,
    shared_pct              numeric(5,2),   -- percentage of genome shared
    longest_segment_cm      integer,
    num_segments            integer,

    -- Predicted relationship label from provider or algorithm
    predicted_relationship  text,
    confidence_level        confidence_level NOT NULL DEFAULT 'UNVERIFIED',

    -- Chromosome browser data (optional — stored in JSONB for flexibility)
    -- Format: [{"chr": "1", "start": 12345678, "end": 23456789, "cm": 15.2}, ...]
    segment_data            jsonb,

    created_at              timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT dna_matches_kits_distinct
        CHECK (kit1_id <> kit2_id),
    CONSTRAINT dna_matches_shared_cm_positive
        CHECK (shared_cm > 0),
    CONSTRAINT dna_matches_shared_pct_range
        CHECK (shared_pct IS NULL OR (shared_pct > 0 AND shared_pct <= 100)),
    CONSTRAINT uq_dna_match_pair
        UNIQUE (kit1_id, kit2_id)
);

CREATE INDEX idx_dna_matches_kit1   ON dna_matches (tenant_id, kit1_id);
CREATE INDEX idx_dna_matches_kit2   ON dna_matches (tenant_id, kit2_id);
CREATE INDEX idx_dna_matches_cm     ON dna_matches (tenant_id, shared_cm DESC);

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER trg_dna_kits_updated_at
    BEFORE UPDATE ON dna_kits
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
