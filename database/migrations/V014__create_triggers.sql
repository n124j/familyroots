-- =============================================================
-- V014__create_triggers.sql
-- FamilyRoots · PostgreSQL 15
-- Audit log triggers, version-history triggers, tree person_count
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Audit log triggers
-- Attach audit_log_trigger() (defined in V011) to key tables.
-- We audit persons and family_groups in full; for high-volume
-- tables (events, media) we audit only DELETEs.
-- ─────────────────────────────────────────────────────────────

-- persons — full INSERT / UPDATE / DELETE audit
CREATE TRIGGER trg_audit_persons
    AFTER INSERT OR UPDATE OR DELETE ON persons
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- family_groups — full audit
CREATE TRIGGER trg_audit_family_groups
    AFTER INSERT OR UPDATE OR DELETE ON family_groups
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- events — DELETE only (edits captured via version_history)
CREATE TRIGGER trg_audit_events_delete
    AFTER DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- tree_collaborators — INSERT / DELETE (role grants/revocations)
CREATE TRIGGER trg_audit_collaborators
    AFTER INSERT OR DELETE ON tree_collaborators
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- invitations — INSERT / UPDATE
CREATE TRIGGER trg_audit_invitations
    AFTER INSERT OR UPDATE ON invitations
    FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─────────────────────────────────────────────────────────────
-- 2. Version history trigger
-- Records a JSONB snapshot of persons / family_groups after each
-- INSERT or UPDATE.  Snapshots are kept indefinitely; the UI uses
-- them to show "what changed" diffs.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_version_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO version_history (
        tenant_id,
        entity_type,
        entity_id,
        version,
        snapshot,
        changed_by,
        created_at
    ) VALUES (
        NEW.tenant_id,
        TG_TABLE_NAME,
        NEW.id,
        COALESCE(NEW.version, 1),
        to_jsonb(NEW),
        NEW.updated_by,
        now()
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_version_persons
    AFTER INSERT OR UPDATE ON persons
    FOR EACH ROW EXECUTE FUNCTION record_version_snapshot();

CREATE TRIGGER trg_version_family_groups
    AFTER INSERT OR UPDATE ON family_groups
    FOR EACH ROW EXECUTE FUNCTION record_version_snapshot();

-- ─────────────────────────────────────────────────────────────
-- 3. Tree person_count maintenance trigger
-- Keeps trees.person_count in sync with inserts/deletes/soft-deletes
-- on persons.  Avoids expensive COUNT(*) queries at read time.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_tree_person_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NOT NEW.is_deleted THEN
        UPDATE trees
        SET person_count = person_count + 1,
            updated_at   = now()
        WHERE id = NEW.tree_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Soft delete toggled on
        IF NOT OLD.is_deleted AND NEW.is_deleted THEN
            UPDATE trees
            SET person_count = GREATEST(person_count - 1, 0),
                updated_at   = now()
            WHERE id = NEW.tree_id;
        -- Soft delete toggled off (restore)
        ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN
            UPDATE trees
            SET person_count = person_count + 1,
                updated_at   = now()
            WHERE id = NEW.tree_id;
        END IF;

    ELSIF TG_OP = 'DELETE' AND NOT OLD.is_deleted THEN
        UPDATE trees
        SET person_count = GREATEST(person_count - 1, 0),
            updated_at   = now()
        WHERE id = OLD.tree_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_tree_person_count
    AFTER INSERT OR UPDATE OR DELETE ON persons
    FOR EACH ROW EXECUTE FUNCTION update_tree_person_count();

-- ─────────────────────────────────────────────────────────────
-- 4. Prevent hard DELETE on audit_log (immutability enforcement)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_audit_log_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log rows are immutable and cannot be deleted'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_immutable_audit_log
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_delete();

-- ─────────────────────────────────────────────────────────────
-- 5. Prevent UPDATE on audit_log (immutability enforcement)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_audit_log_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log rows are immutable and cannot be updated'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_immutable_audit_log_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_update();
