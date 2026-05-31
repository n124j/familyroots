-- =============================================================
-- V013__create_indexes.sql
-- FamilyRoots · PostgreSQL 15
-- Additional cross-table and covering indexes
-- (table-local indexes are defined in their respective migration files)
-- All created CONCURRENTLY — safe for production with zero lock.
-- =============================================================

-- ── Persons: composite covering index for tree-page query ─────
-- Covers: SELECT id, display_given_name, display_surname, sex, is_living
--         FROM persons WHERE tenant_id = $1 AND tree_id = $2
--         AND is_deleted = false ORDER BY display_surname, display_given_name
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_persons_tree_name_cover
ON persons (tenant_id, tree_id, display_surname, display_given_name)
INCLUDE (sex, is_living, is_deceased)
WHERE is_deleted = false;

-- ── Family group: parent pair lookup ─────────────────────────
-- "Find the family group for these two parents"
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_fgroups_parent_pair
ON family_groups (tenant_id, parent1_id, parent2_id)
WHERE parent1_id IS NOT NULL AND parent2_id IS NOT NULL;

-- ── Events: BIRT/DEAT lookup per person (most common query) ──
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_events_birth_death
ON events (tenant_id, person_id, event_type)
WHERE event_type IN ('BIRTH','DEATH') AND person_id IS NOT NULL;

-- ── Events: date range scan ───────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_events_date_brin
ON events USING BRIN (event_date)
WHERE event_date IS NOT NULL;

-- ── Media: pending-processing queue ──────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_media_pending_queue
ON media (created_at ASC)
WHERE status = 'PENDING';

-- ── Notifications: per-user unread count (hot path) ──────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_notifications_unread_count
ON notifications (tenant_id, user_id)
INCLUDE (created_at)
WHERE is_read = false;

-- ── Source citations: entity lookup ──────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_sc_entity_covering
ON source_citations (tenant_id, entity_type, entity_id)
INCLUDE (source_id, quality);

-- ── Version history: latest snapshot per entity ───────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_vh_latest_snapshot
ON version_history (tenant_id, entity_type, entity_id, version DESC);

-- ── DNA matches: shared_cm threshold scan ────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_dna_matches_cm_threshold
ON dna_matches (tenant_id, shared_cm DESC)
WHERE shared_cm >= 7;

-- ── Comments: latest N comments per entity ───────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_comments_entity_recent
ON comments (tenant_id, entity_type, entity_id, created_at DESC)
WHERE is_deleted = false;

-- ── Places: geo bounding box (lat/lng range scan) ─────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_places_geo
ON places (tenant_id, latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ── Import/Export jobs: user history ─────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_import_user_history
ON import_jobs (tenant_id, user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_export_user_history
ON export_jobs (tenant_id, user_id, created_at DESC);

-- ── Tree collaborators: role-based ───────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_collaborators_role
ON tree_collaborators (tenant_id, tree_id, role);
