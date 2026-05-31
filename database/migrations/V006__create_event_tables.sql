-- =============================================================
-- V006__create_event_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Places, events, event_participants
-- =============================================================

-- ── places ────────────────────────────────────────────────────
-- Normalised place registry shared across all events in a tenant.
-- Coordinates stored as NUMERIC for portability (PostGIS not required).
CREATE TABLE places (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,

    -- Hierarchical place name (most specific → least specific)
    name            text            NOT NULL,   -- e.g. "St Mary's Church"
    city            text,
    county          text,
    state_province  text,
    country         text,
    country_code    char(2),                    -- ISO 3166-1 alpha-2

    -- Geo coordinates (decimal degrees)
    latitude        numeric(9,6),
    longitude       numeric(9,6),

    -- External identifiers
    geonames_id     bigint,
    wikidata_id     text,

    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT places_lat_range
        CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
    CONSTRAINT places_lng_range
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT places_country_code_format
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX idx_places_tenant          ON places (tenant_id);
CREATE INDEX idx_places_country         ON places (tenant_id, country_code)
    WHERE country_code IS NOT NULL;
-- Trigram for fuzzy place name search
CREATE INDEX idx_places_name_trgm       ON places
    USING GIN (name gin_trgm_ops);

-- ── events ────────────────────────────────────────────────────
-- An event belongs to EITHER a person OR a family_group (not both).
-- Family-level events: MARRIAGE, DIVORCE, ENGAGEMENT, CENSUS (household)
-- Person-level events: BIRTH, DEATH, BAPTISM, OCCUPATION, RESIDENCE, etc.
CREATE TABLE events (
    id                      uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id                 uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,

    -- Owner: exactly one of these must be non-NULL
    person_id               uuid            REFERENCES persons (id) ON DELETE CASCADE,
    family_group_id         uuid            REFERENCES family_groups (id) ON DELETE CASCADE,

    event_type              event_type      NOT NULL,

    -- Date handling: GEDCOM-compatible
    -- event_date stores the primary date (or range start)
    -- event_date_qualifier: EXACT | ABOUT | BEFORE | AFTER | BETWEEN | CALCULATED | ESTIMATED
    -- event_date_range_end: only used when qualifier = BETWEEN
    event_date              date,
    event_date_qualifier    event_date_qualifier NOT NULL DEFAULT 'EXACT',
    event_date_range_end    date,

    -- Original GEDCOM date string preserved for display / round-trip
    event_date_original     text,

    place_id                uuid            REFERENCES places (id) ON DELETE SET NULL,

    description             text,
    confidence_level        confidence_level NOT NULL DEFAULT 'UNVERIFIED',

    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            REFERENCES users (id) ON DELETE SET NULL,

    -- Exactly one owner
    CONSTRAINT events_single_owner
        CHECK (
            (person_id IS NOT NULL AND family_group_id IS NULL) OR
            (person_id IS NULL     AND family_group_id IS NOT NULL)
        ),
    -- Range end only valid when qualifier = BETWEEN
    CONSTRAINT events_range_end_between_only
        CHECK (
            event_date_range_end IS NULL OR
            event_date_qualifier = 'BETWEEN'
        ),
    -- Range end must be after range start
    CONSTRAINT events_date_range_order
        CHECK (
            event_date_range_end IS NULL OR
            event_date_range_end > event_date
        )
);

CREATE INDEX idx_events_person          ON events (tenant_id, person_id, event_type)
    WHERE person_id IS NOT NULL;
CREATE INDEX idx_events_family          ON events (tenant_id, family_group_id, event_type)
    WHERE family_group_id IS NOT NULL;
CREATE INDEX idx_events_date            ON events (tenant_id, event_date)
    WHERE event_date IS NOT NULL;
CREATE INDEX idx_events_tree            ON events (tenant_id, tree_id);
CREATE INDEX idx_events_place           ON events (place_id)
    WHERE place_id IS NOT NULL;

-- ── event_participants ────────────────────────────────────────
-- Persons who participated in an event in a defined role.
-- E.g. WITNESS at a marriage, GODPARENT at a baptism.
CREATE TABLE event_participants (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    event_id            uuid            NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    person_id           uuid            NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    participant_role    text            NOT NULL DEFAULT 'PARTICIPANT',

    CONSTRAINT ep_role_values CHECK (
        participant_role IN (
            'PARTICIPANT','WITNESS','GODPARENT','OFFICIANT',
            'INFORMANT','GUARDIAN','CUSTOM'
        )
    ),
    CONSTRAINT uq_event_participant UNIQUE (event_id, person_id, participant_role)
);

CREATE INDEX idx_ep_event      ON event_participants (tenant_id, event_id);
CREATE INDEX idx_ep_person     ON event_participants (tenant_id, person_id);

-- ── updated_at triggers ───────────────────────────────────────
CREATE TRIGGER trg_places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
