-- =============================================================
-- V011__create_audit_tables.sql
-- FamilyRoots · PostgreSQL 15
-- version_history  — point-in-time snapshots (partitioned by month)
-- audit_log        — immutable action log (partitioned by month)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- version_history
-- Records a full JSONB snapshot of an entity after each change.
-- Enables "undo" and diff comparisons in the UI.
-- PARTITION BY RANGE(created_at) — monthly partitions.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE version_history (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    entity_type     text            NOT NULL,
    entity_id       uuid            NOT NULL,
    version         integer         NOT NULL,
    snapshot        jsonb           NOT NULL,
    changed_by      uuid            REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT version_history_entity_type_values
        CHECK (entity_type IN (
            'person','family_group','event','relationship',
            'person_name','source','media','tree'
        )),
    CONSTRAINT version_history_version_positive
        CHECK (version >= 1),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Default / fallback partition (catches rows outside defined ranges)
CREATE TABLE version_history_default
    PARTITION OF version_history DEFAULT;

-- Monthly partitions for Y1: 2025-01 → 2025-12
DO $$
DECLARE
    y        int  := 2025;
    m        int;
    start_d  date;
    end_d    date;
    tname    text;
BEGIN
    FOR m IN 1..12 LOOP
        start_d := make_date(y, m, 1);
        end_d   := start_d + INTERVAL '1 month';
        tname   := format('version_history_%s_%s',
                          y, lpad(m::text, 2, '0'));
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF version_history
             FOR VALUES FROM (%L) TO (%L)',
            tname, start_d, end_d
        );
    END LOOP;
END;
$$;

-- Monthly partitions for Y2: 2026-01 → 2026-12
DO $$
DECLARE
    y        int  := 2026;
    m        int;
    start_d  date;
    end_d    date;
    tname    text;
BEGIN
    FOR m IN 1..12 LOOP
        start_d := make_date(y, m, 1);
        end_d   := start_d + INTERVAL '1 month';
        tname   := format('version_history_%s_%s',
                          y, lpad(m::text, 2, '0'));
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF version_history
             FOR VALUES FROM (%L) TO (%L)',
            tname, start_d, end_d
        );
    END LOOP;
END;
$$;

-- Indexes on partition parent (inherited by child partitions)
CREATE INDEX idx_vh_tenant_entity   ON version_history (tenant_id, entity_type, entity_id);
CREATE INDEX idx_vh_entity_version  ON version_history (entity_id, version);
CREATE INDEX idx_vh_created_at      ON version_history (tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- audit_log
-- Immutable, append-only record of all data-modifying actions.
-- Never deleted. Archival to S3/Glacier via pg_cron job after 12 months.
-- PARTITION BY RANGE(created_at) — monthly partitions.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL,   -- no FK: must survive tenant deletion
    action          audit_action    NOT NULL,
    entity_type     text            NOT NULL,
    entity_id       uuid,
    actor_id        uuid,           -- no FK: must survive user deletion
    actor_ip        inet,
    actor_ua        text,
    old_values      jsonb,          -- NULL for INSERT
    new_values      jsonb,          -- NULL for DELETE
    request_id      text,           -- correlation ID from HTTP request
    created_at      timestamptz     NOT NULL DEFAULT now(),

    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Default / fallback partition
CREATE TABLE audit_log_default
    PARTITION OF audit_log DEFAULT;

-- Monthly partitions Y1: 2025-01 → 2025-12
DO $$
DECLARE
    y        int  := 2025;
    m        int;
    start_d  date;
    end_d    date;
    tname    text;
BEGIN
    FOR m IN 1..12 LOOP
        start_d := make_date(y, m, 1);
        end_d   := start_d + INTERVAL '1 month';
        tname   := format('audit_log_%s_%s',
                          y, lpad(m::text, 2, '0'));
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_log
             FOR VALUES FROM (%L) TO (%L)',
            tname, start_d, end_d
        );
    END LOOP;
END;
$$;

-- Monthly partitions Y2: 2026-01 → 2026-12
DO $$
DECLARE
    y        int  := 2026;
    m        int;
    start_d  date;
    end_d    date;
    tname    text;
BEGIN
    FOR m IN 1..12 LOOP
        start_d := make_date(y, m, 1);
        end_d   := start_d + INTERVAL '1 month';
        tname   := format('audit_log_%s_%s',
                          y, lpad(m::text, 2, '0'));
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_log
             FOR VALUES FROM (%L) TO (%L)',
            tname, start_d, end_d
        );
    END LOOP;
END;
$$;

CREATE INDEX idx_al_tenant_created  ON audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_al_entity          ON audit_log (entity_type, entity_id)
    WHERE entity_id IS NOT NULL;
CREATE INDEX idx_al_actor           ON audit_log (actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- Partition maintenance procedure
-- Called by pg_cron monthly to create next month's partition
-- and schedule archival of partitions older than 12 months.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE create_next_month_partitions(target_month date)
LANGUAGE plpgsql AS $$
DECLARE
    start_d  date := date_trunc('month', target_month);
    end_d    date := start_d + INTERVAL '1 month';
    tname    text;
BEGIN
    -- version_history
    tname := format('version_history_%s_%s',
                    to_char(start_d, 'YYYY'),
                    to_char(start_d, 'MM'));
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF version_history
         FOR VALUES FROM (%L) TO (%L)',
        tname, start_d, end_d
    );

    -- audit_log
    tname := format('audit_log_%s_%s',
                    to_char(start_d, 'YYYY'),
                    to_char(start_d, 'MM'));
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log
         FOR VALUES FROM (%L) TO (%L)',
        tname, start_d, end_d
    );
END;
$$;

-- ── Audit trigger function ────────────────────────────────────
-- Generic trigger: writes a row to audit_log on INSERT/UPDATE/DELETE.
-- Attach to any table that requires auditing.
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_action      audit_action;
    v_entity_id   uuid;
    v_tenant_id   uuid;
    v_old         jsonb := NULL;
    v_new         jsonb := NULL;
BEGIN
    v_action    := TG_OP::audit_action;
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
    END IF;

    INSERT INTO audit_log (
        tenant_id, action, entity_type, entity_id,
        old_values, new_values, created_at
    ) VALUES (
        v_tenant_id, v_action, TG_TABLE_NAME, v_entity_id,
        v_old, v_new, now()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;
