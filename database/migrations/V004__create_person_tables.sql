-- =============================================================
-- V004__create_person_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Persons and person names
-- Supports unlimited generations via family_group_members
-- =============================================================

-- ── persons ───────────────────────────────────────────────────
CREATE TABLE persons (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id             uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,

    -- Identity
    sex                 person_sex      NOT NULL DEFAULT 'UNKNOWN',
    privacy_level       privacy_level   NOT NULL DEFAULT 'FAMILY',

    -- Status flags
    is_living           boolean         NOT NULL DEFAULT true,
    is_deceased         boolean         NOT NULL DEFAULT false,

    -- Denormalised display fields (kept in sync by trigger on person_names)
    display_given_name  text,
    display_surname     text,

    -- Full-text search vector (updated by trigger)
    search_vector       tsvector,

    -- Flexible custom fields (e.g. occupation, religion, notes)
    custom_fields       jsonb           NOT NULL DEFAULT '{}',

    -- External references (GEDCOM xref_id for import/export)
    gedcom_xref         text,

    -- Soft delete
    is_deleted          boolean         NOT NULL DEFAULT false,
    deleted_at          timestamptz,
    deleted_by          uuid            REFERENCES users (id) ON DELETE SET NULL,

    -- Optimistic locking
    version             integer         NOT NULL DEFAULT 1,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            REFERENCES users (id) ON DELETE SET NULL,
    updated_by          uuid            REFERENCES users (id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT persons_living_deceased_exclusive
        CHECK (NOT (is_living = true AND is_deceased = true)),
    CONSTRAINT persons_deleted_at_consistent
        CHECK ((is_deleted = false AND deleted_at IS NULL) OR
               (is_deleted = true  AND deleted_at IS NOT NULL)),
    CONSTRAINT persons_version_positive
        CHECK (version >= 1)
);

-- B-tree indexes
CREATE INDEX idx_persons_tenant_tree        ON persons (tenant_id, tree_id);
CREATE INDEX idx_persons_surname            ON persons (tenant_id, display_surname);
CREATE INDEX idx_persons_living             ON persons (tenant_id, tree_id)
    WHERE is_living = true AND is_deleted = false;
CREATE INDEX idx_persons_active             ON persons (tenant_id, tree_id)
    WHERE is_deleted = false;
CREATE INDEX idx_persons_gedcom             ON persons (tenant_id, gedcom_xref)
    WHERE gedcom_xref IS NOT NULL;

-- Full-text search (GIN)
CREATE INDEX idx_persons_search_vector      ON persons USING GIN (search_vector);

-- Trigram fuzzy name search
CREATE INDEX idx_persons_given_trgm         ON persons
    USING GIN (display_given_name gin_trgm_ops)
    WHERE is_deleted = false;
CREATE INDEX idx_persons_surname_trgm       ON persons
    USING GIN (display_surname gin_trgm_ops)
    WHERE is_deleted = false;

-- ── person_names ──────────────────────────────────────────────
-- One person can have multiple names across their lifetime
-- (birth name, married name, adopted name, alias, etc.)
CREATE TABLE person_names (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    person_id       uuid            NOT NULL REFERENCES persons (id) ON DELETE CASCADE,

    name_type       name_type       NOT NULL DEFAULT 'BIRTH',
    given_name      text,
    surname         text,
    prefix          text,           -- Mr, Dr, Rev, etc.
    suffix          text,           -- Jr, Sr, III, PhD, etc.
    nickname        text,
    full_name_text  text,           -- free-form override for non-Western names

    is_primary      boolean         NOT NULL DEFAULT false,

    -- Optional temporal range (e.g. married name valid from 1945)
    valid_from      date,
    valid_to        date,

    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT person_names_valid_range
        CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT person_names_has_content
        CHECK (
            given_name IS NOT NULL OR
            surname    IS NOT NULL OR
            full_name_text IS NOT NULL
        )
);

-- Only one primary name per person
CREATE UNIQUE INDEX uq_person_name_primary
    ON person_names (person_id)
    WHERE is_primary = true;

CREATE INDEX idx_person_names_person    ON person_names (tenant_id, person_id);
CREATE INDEX idx_person_names_surname   ON person_names (tenant_id, surname)
    WHERE surname IS NOT NULL;
CREATE INDEX idx_person_names_given     ON person_names (tenant_id, given_name)
    WHERE given_name IS NOT NULL;

-- Trigram indexes for fuzzy search on name parts
CREATE INDEX idx_pnames_surname_trgm    ON person_names
    USING GIN (surname gin_trgm_ops)
    WHERE surname IS NOT NULL;
CREATE INDEX idx_pnames_given_trgm      ON person_names
    USING GIN (given_name gin_trgm_ops)
    WHERE given_name IS NOT NULL;

-- ── updated_at triggers ───────────────────────────────────────
CREATE TRIGGER trg_persons_updated_at
    BEFORE UPDATE ON persons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_person_names_updated_at
    BEFORE UPDATE ON person_names
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── search_vector trigger ─────────────────────────────────────
-- Updates the tsvector on persons whenever a primary name changes
CREATE OR REPLACE FUNCTION update_person_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE persons p
    SET search_vector = to_tsvector(
        'simple',
        coalesce(pn.given_name, '') || ' ' ||
        coalesce(pn.surname,    '') || ' ' ||
        coalesce(pn.nickname,   '') || ' ' ||
        coalesce(pn.full_name_text, '')
    )
    FROM (
        SELECT * FROM person_names
        WHERE person_id = NEW.person_id AND is_primary = true
        LIMIT 1
    ) pn
    WHERE p.id = NEW.person_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_person_name_search_vector
    AFTER INSERT OR UPDATE ON person_names
    FOR EACH ROW EXECUTE FUNCTION update_person_search_vector();

-- ── display name sync trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION sync_person_display_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_primary THEN
        UPDATE persons
        SET display_given_name = NEW.given_name,
            display_surname    = NEW.surname,
            updated_at         = now()
        WHERE id = NEW.person_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_display_name
    AFTER INSERT OR UPDATE ON person_names
    FOR EACH ROW EXECUTE FUNCTION sync_person_display_name();

-- ── optimistic locking trigger ────────────────────────────────
CREATE OR REPLACE FUNCTION increment_person_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version != OLD.version + 1 THEN
        RAISE EXCEPTION
            'Stale version for person %. Expected % got %',
            OLD.id, OLD.version + 1, NEW.version
            USING ERRCODE = '40001';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_person_version_check
    BEFORE UPDATE ON persons
    FOR EACH ROW
    WHEN (OLD.version IS DISTINCT FROM NEW.version)
    EXECUTE FUNCTION increment_person_version();
