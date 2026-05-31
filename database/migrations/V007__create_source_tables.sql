-- =============================================================
-- V007__create_source_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Sources and source citations (evidence layer)
-- =============================================================

-- ── sources ───────────────────────────────────────────────────
-- A source is a reference document (book, census record, website, etc.)
-- One source can be cited by many entities (persons, events, etc.)
CREATE TABLE sources (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id             uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,

    title               text            NOT NULL,
    author              text,
    publisher           text,
    publication_date    text,           -- free-form: "1901", "Jan 1901", etc.
    repository          text,           -- archive or library name
    call_number         text,
    url                 text,
    source_type         text            NOT NULL DEFAULT 'OTHER',

    -- GEDCOM SOUR xref
    gedcom_xref         text,

    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT sources_title_length
        CHECK (char_length(title) BETWEEN 1 AND 500),
    CONSTRAINT sources_type_values
        CHECK (source_type IN (
            'VITAL_RECORD','CENSUS','CHURCH_RECORD','NEWSPAPER',
            'MILITARY','IMMIGRATION','LAND_RECORD','PROBATE',
            'PHOTOGRAPH','BOOK','WEBSITE','DATABASE','OTHER'
        ))
);

CREATE INDEX idx_sources_tenant_tree    ON sources (tenant_id, tree_id);
CREATE INDEX idx_sources_title_trgm     ON sources
    USING GIN (title gin_trgm_ops);

-- ── source_citations ─────────────────────────────────────────
-- Polymorphic: cites any entity (person, event, family_group, etc.)
-- entity_type + entity_id avoids a proliferation of FK columns.
CREATE TABLE source_citations (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    source_id       uuid            NOT NULL REFERENCES sources (id) ON DELETE CASCADE,

    -- Polymorphic reference
    entity_type     text            NOT NULL,   -- 'person'|'event'|'family_group'|'person_name'
    entity_id       uuid            NOT NULL,

    page_ref        text,           -- page number or specific section
    quality         text            NOT NULL DEFAULT 'UNKNOWN',
    notes           text,

    created_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT sc_entity_type_values
        CHECK (entity_type IN (
            'person','event','family_group',
            'person_name','relationship','media'
        )),
    CONSTRAINT sc_quality_values
        CHECK (quality IN ('PRIMARY','SECONDARY','INDIRECT','UNKNOWN')),
    CONSTRAINT uq_citation UNIQUE (source_id, entity_type, entity_id)
);

CREATE INDEX idx_sc_source          ON source_citations (tenant_id, source_id);
CREATE INDEX idx_sc_entity          ON source_citations (entity_type, entity_id);
CREATE INDEX idx_sc_tenant_entity   ON source_citations (tenant_id, entity_type, entity_id);

-- ── updated_at trigger ────────────────────────────────────────
CREATE TRIGGER trg_sources_updated_at
    BEFORE UPDATE ON sources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
