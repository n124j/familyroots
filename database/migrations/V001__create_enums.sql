-- =============================================================
-- V001__create_enums.sql
-- FamilyRoots · PostgreSQL 15
-- All application-wide ENUM types
-- =============================================================

-- ── Tenant / Subscription ────────────────────────────────────
CREATE TYPE subscription_plan AS ENUM (
    'FREE',
    'BASIC',
    'PREMIUM',
    'FAMILY',
    'PROFESSIONAL'
);

-- ── Person ───────────────────────────────────────────────────
CREATE TYPE person_sex AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER',
    'UNKNOWN'
);

CREATE TYPE name_type AS ENUM (
    'BIRTH',
    'MARRIED',
    'ALSO_KNOWN_AS',
    'NICKNAME',
    'RELIGIOUS',
    'ADOPTED',
    'OTHER'
);

CREATE TYPE privacy_level AS ENUM (
    'PUBLIC',
    'FAMILY',
    'PRIVATE'
);

-- ── Family / Relationships ────────────────────────────────────
CREATE TYPE union_type AS ENUM (
    'MARRIAGE',
    'CIVIL_UNION',
    'DOMESTIC_PARTNERSHIP',
    'COHABITATION',
    'UNKNOWN'
);

CREATE TYPE parentage_type AS ENUM (
    'BIOLOGICAL',
    'ADOPTIVE',
    'STEP',
    'FOSTER',
    'UNKNOWN'
);

CREATE TYPE relationship_type AS ENUM (
    'SPOUSE',           -- point-in-time outside family_groups (e.g. ex)
    'PARTNER',
    'GODPARENT',
    'GUARDIAN',
    'MENTOR',
    'CUSTOM'
);

-- ── Events ───────────────────────────────────────────────────
CREATE TYPE event_type AS ENUM (
    -- Vital
    'BIRTH',
    'DEATH',
    'BAPTISM',
    'BURIAL',
    'CREMATION',
    -- Union
    'MARRIAGE',
    'DIVORCE',
    'ENGAGEMENT',
    'ANNULMENT',
    -- Migration
    'IMMIGRATION',
    'EMIGRATION',
    'NATURALIZATION',
    -- Occupation
    'OCCUPATION',
    'RETIREMENT',
    'GRADUATION',
    -- Military
    'MILITARY_SERVICE',
    'MILITARY_DISCHARGE',
    -- Residence
    'RESIDENCE',
    'CENSUS',
    -- Other
    'MEDICAL',
    'RELIGIOUS',
    'CUSTOM'
);

CREATE TYPE event_date_qualifier AS ENUM (
    'EXACT',
    'ABOUT',
    'BEFORE',
    'AFTER',
    'BETWEEN',
    'CALCULATED',
    'ESTIMATED'
);

CREATE TYPE confidence_level AS ENUM (
    'PROVEN',
    'PROBABLE',
    'POSSIBLE',
    'UNVERIFIED'
);

-- ── Media ─────────────────────────────────────────────────────
CREATE TYPE media_type AS ENUM (
    'PHOTO',
    'DOCUMENT',
    'AUDIO',
    'VIDEO',
    'OTHER'
);

CREATE TYPE media_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'READY',
    'FAILED',
    'DELETED'
);

-- ── Collaboration ─────────────────────────────────────────────
CREATE TYPE collaborator_role AS ENUM (
    'VIEWER',
    'CONTRIBUTOR',
    'EDITOR',
    'ADMIN'
);

CREATE TYPE invitation_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'REVOKED'
);

-- ── DNA ───────────────────────────────────────────────────────
CREATE TYPE dna_provider AS ENUM (
    'ANCESTRY',
    '23ANDME',
    'MYHERITAGE',
    'FTDNA',
    'LIVING_DNA',
    'OTHER'
);

-- ── Jobs ─────────────────────────────────────────────────────
CREATE TYPE import_format AS ENUM (
    'GEDCOM_551',
    'GEDCOM_70',
    'CSV',
    'JSON'
);

CREATE TYPE export_format AS ENUM (
    'GEDCOM_551',
    'GEDCOM_70',
    'PDF_PEDIGREE',
    'PDF_FAMILY_BOOK',
    'CSV',
    'JSON'
);

CREATE TYPE job_status AS ENUM (
    'QUEUED',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);

-- ── Audit ─────────────────────────────────────────────────────
CREATE TYPE audit_action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'SOFT_DELETE',
    'RESTORE',
    'LOGIN',
    'LOGOUT',
    'EXPORT',
    'IMPORT',
    'INVITE',
    'SHARE'
);
