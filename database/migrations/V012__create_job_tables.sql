-- =============================================================
-- V012__create_job_tables.sql
-- FamilyRoots · PostgreSQL 15
-- import_jobs and export_jobs (Celery task tracking)
-- =============================================================

-- ── import_jobs ───────────────────────────────────────────────
CREATE TABLE import_jobs (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id             uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
    user_id             uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    format              import_format   NOT NULL,
    status              job_status      NOT NULL DEFAULT 'QUEUED',

    -- S3 key of the uploaded source file
    storage_key         text            NOT NULL,

    -- Progress counters
    total_records       integer         NOT NULL DEFAULT 0,
    processed_records   integer         NOT NULL DEFAULT 0,
    error_count         integer         NOT NULL DEFAULT 0,

    -- Structured error log (first N errors)
    -- Format: [{"line": 42, "code": "INVALID_DATE", "message": "..."}, ...]
    error_details       jsonb           NOT NULL DEFAULT '[]',

    -- Celery task id for status polling
    celery_task_id      text,

    started_at          timestamptz,
    completed_at        timestamptz,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT import_total_records_positive
        CHECK (total_records >= 0),
    CONSTRAINT import_processed_records_positive
        CHECK (processed_records >= 0),
    CONSTRAINT import_error_count_positive
        CHECK (error_count >= 0),
    CONSTRAINT import_progress_consistent
        CHECK (processed_records <= total_records OR total_records = 0),
    CONSTRAINT import_completed_after_started
        CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX idx_import_jobs_tenant     ON import_jobs (tenant_id, user_id);
CREATE INDEX idx_import_jobs_tree       ON import_jobs (tenant_id, tree_id);
CREATE INDEX idx_import_jobs_status     ON import_jobs (status)
    WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX idx_import_jobs_celery     ON import_jobs (celery_task_id)
    WHERE celery_task_id IS NOT NULL;

-- ── export_jobs ───────────────────────────────────────────────
CREATE TABLE export_jobs (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id             uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
    user_id             uuid            NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    format              export_format   NOT NULL,
    status              job_status      NOT NULL DEFAULT 'QUEUED',

    -- S3 key of the generated output file
    storage_key         text,

    -- Pre-signed download URL (valid for a limited time)
    download_url        text,
    url_expires_at      timestamptz,

    -- Export scope filters (e.g. person subtree, date range)
    export_options      jsonb           NOT NULL DEFAULT '{}',

    celery_task_id      text,

    started_at          timestamptz,
    completed_at        timestamptz,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT export_url_consistent
        CHECK (
            (download_url IS NULL AND url_expires_at IS NULL) OR
            (download_url IS NOT NULL AND url_expires_at IS NOT NULL)
        ),
    CONSTRAINT export_completed_after_started
        CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX idx_export_jobs_tenant     ON export_jobs (tenant_id, user_id);
CREATE INDEX idx_export_jobs_tree       ON export_jobs (tenant_id, tree_id);
CREATE INDEX idx_export_jobs_status     ON export_jobs (status)
    WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX idx_export_jobs_celery     ON export_jobs (celery_task_id)
    WHERE celery_task_id IS NOT NULL;

-- ── updated_at triggers ───────────────────────────────────────
CREATE TRIGGER trg_import_jobs_updated_at
    BEFORE UPDATE ON import_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_export_jobs_updated_at
    BEFORE UPDATE ON export_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
