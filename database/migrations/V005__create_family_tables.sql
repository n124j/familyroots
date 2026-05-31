-- =============================================================
-- V005__create_family_tables.sql
-- FamilyRoots · PostgreSQL 15
-- Family groups (GEDCOM FAM), members, and relationships
--
-- Design rationale:
--   family_groups   = one FAM record (0-2 parents, N children)
--   family_group_members = persons in that FAM record
--                          role: PARENT | CHILD
--                          parentage_type (children only):
--                            BIOLOGICAL, ADOPTIVE, STEP, FOSTER, UNKNOWN
--
--   This model naturally handles:
--     • Multiple spouses  → multiple family_groups sharing a parent
--     • Half-siblings     → two family_groups, one shared parent
--     • Step-children     → STEP parentage_type
--     • Adoptions         → ADOPTIVE parentage_type
--     • Divorce           → is_divorced flag on family_group
--     • Unlimited gens    → recursive CTE over family_group_members
--
--   relationships   = non-family-group links (godparent, guardian, etc.)
-- =============================================================

-- ── family_groups ─────────────────────────────────────────────
CREATE TABLE family_groups (
    id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id         uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,

    -- 0, 1, or 2 parents (NULL = unknown parent slot)
    parent1_id      uuid            REFERENCES persons (id) ON DELETE SET NULL,
    parent2_id      uuid            REFERENCES persons (id) ON DELETE SET NULL,

    union_type      union_type      NOT NULL DEFAULT 'MARRIAGE',
    is_divorced     boolean         NOT NULL DEFAULT false,

    -- GEDCOM FAM xref for import/export round-trip
    gedcom_xref     text,

    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    -- Parents must be different persons
    CONSTRAINT family_groups_parents_distinct
        CHECK (parent1_id IS NULL OR parent2_id IS NULL OR parent1_id <> parent2_id)
);

CREATE INDEX idx_fgroups_tenant_tree        ON family_groups (tenant_id, tree_id);
CREATE INDEX idx_fgroups_parent1            ON family_groups (tenant_id, parent1_id)
    WHERE parent1_id IS NOT NULL;
CREATE INDEX idx_fgroups_parent2            ON family_groups (tenant_id, parent2_id)
    WHERE parent2_id IS NOT NULL;
CREATE INDEX idx_fgroups_gedcom             ON family_groups (tenant_id, gedcom_xref)
    WHERE gedcom_xref IS NOT NULL;

-- ── family_group_members ──────────────────────────────────────
-- Links persons to a family group in either PARENT or CHILD role.
-- PARENT rows mirror parent1_id / parent2_id for symmetric lookups.
-- CHILD rows carry parentage_type indicating how the child is related.
CREATE TABLE family_group_members (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    family_group_id     uuid            NOT NULL REFERENCES family_groups (id) ON DELETE CASCADE,
    person_id           uuid            NOT NULL REFERENCES persons (id) ON DELETE CASCADE,

    member_role         text            NOT NULL,   -- 'PARENT' | 'CHILD'
    parentage_type      parentage_type,             -- set for CHILD role only
    birth_order         integer,                    -- optional ordering of siblings

    created_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT fgm_member_role_values
        CHECK (member_role IN ('PARENT', 'CHILD')),
    CONSTRAINT fgm_parentage_child_only
        CHECK (
            (member_role = 'CHILD' AND parentage_type IS NOT NULL) OR
            (member_role = 'PARENT' AND parentage_type IS NULL)
        ),
    CONSTRAINT fgm_birth_order_positive
        CHECK (birth_order IS NULL OR birth_order >= 1),
    -- A person can only be in one role per family group
    CONSTRAINT uq_fgm_person_family UNIQUE (family_group_id, person_id)
);

CREATE INDEX idx_fgm_family_role        ON family_group_members (family_group_id, member_role);
CREATE INDEX idx_fgm_person_role        ON family_group_members (person_id, member_role);
CREATE INDEX idx_fgm_tenant_person      ON family_group_members (tenant_id, person_id);
CREATE INDEX idx_fgm_tenant_family      ON family_group_members (tenant_id, family_group_id);

-- ── relationships ─────────────────────────────────────────────
-- Captures non-family-group relationships:
--   GODPARENT, GUARDIAN, PARTNER (outside of a union), CUSTOM
-- Spouse relationships within a marriage are stored in family_groups.
CREATE TABLE relationships (
    id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    tree_id             uuid            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
    person1_id          uuid            NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    person2_id          uuid            NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
    relationship_type   relationship_type NOT NULL,
    notes               text,
    confidence_level    confidence_level  NOT NULL DEFAULT 'UNVERIFIED',
    created_at          timestamptz     NOT NULL DEFAULT now(),
    updated_at          timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT relationships_persons_distinct
        CHECK (person1_id <> person2_id),
    -- Prevent duplicate bidirectional pairs
    CONSTRAINT uq_relationship_pair
        UNIQUE (tenant_id, person1_id, person2_id, relationship_type)
);

CREATE INDEX idx_rels_person1   ON relationships (tenant_id, person1_id);
CREATE INDEX idx_rels_person2   ON relationships (tenant_id, person2_id);
CREATE INDEX idx_rels_tree      ON relationships (tenant_id, tree_id);

-- ── updated_at triggers ───────────────────────────────────────
CREATE TRIGGER trg_fgroups_updated_at
    BEFORE UPDATE ON family_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_relationships_updated_at
    BEFORE UPDATE ON relationships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Recursive CTE helpers (views, not application code) ───────
-- View: all ancestors of a person (unlimited depth)
CREATE OR REPLACE VIEW v_person_ancestors AS
WITH RECURSIVE ancestors AS (
    -- Base: parents in all family groups the person appears as CHILD
    SELECT
        fgm_child.person_id     AS subject_id,
        p.id                    AS ancestor_id,
        p.display_given_name,
        p.display_surname,
        fg.id                   AS family_group_id,
        1                       AS depth,
        ARRAY[fgm_child.person_id] AS path
    FROM family_group_members fgm_child
    JOIN family_groups fg ON fg.id = fgm_child.family_group_id
    JOIN persons p ON p.id IN (fg.parent1_id, fg.parent2_id)
    WHERE fgm_child.member_role = 'CHILD'
      AND p.is_deleted = false

    UNION ALL

    -- Recursive: parents of ancestors
    SELECT
        a.subject_id,
        p2.id,
        p2.display_given_name,
        p2.display_surname,
        fg2.id,
        a.depth + 1,
        a.path || a.ancestor_id
    FROM ancestors a
    JOIN family_group_members fgm2
        ON fgm2.person_id = a.ancestor_id
       AND fgm2.member_role = 'CHILD'
    JOIN family_groups fg2  ON fg2.id = fgm2.family_group_id
    JOIN persons p2 ON p2.id IN (fg2.parent1_id, fg2.parent2_id)
    WHERE NOT (p2.id = ANY(a.path))   -- cycle guard
      AND a.depth < 100               -- hard depth limit
      AND p2.is_deleted = false
)
SELECT * FROM ancestors;

-- View: all descendants of a person (unlimited depth)
CREATE OR REPLACE VIEW v_person_descendants AS
WITH RECURSIVE descendants AS (
    -- Base: children in all family groups the person appears as PARENT
    SELECT
        p_start.id              AS subject_id,
        child.person_id         AS descendant_id,
        pd.display_given_name,
        pd.display_surname,
        child.parentage_type,
        fg.id                   AS family_group_id,
        1                       AS depth,
        ARRAY[p_start.id]       AS path
    FROM persons p_start
    JOIN family_groups fg
        ON fg.parent1_id = p_start.id OR fg.parent2_id = p_start.id
    JOIN family_group_members child
        ON child.family_group_id = fg.id AND child.member_role = 'CHILD'
    JOIN persons pd ON pd.id = child.person_id
    WHERE pd.is_deleted = false

    UNION ALL

    SELECT
        d.subject_id,
        child2.person_id,
        pd2.display_given_name,
        pd2.display_surname,
        child2.parentage_type,
        fg2.id,
        d.depth + 1,
        d.path || d.descendant_id
    FROM descendants d
    JOIN family_groups fg2
        ON fg2.parent1_id = d.descendant_id OR fg2.parent2_id = d.descendant_id
    JOIN family_group_members child2
        ON child2.family_group_id = fg2.id AND child2.member_role = 'CHILD'
    JOIN persons pd2 ON pd2.id = child2.person_id
    WHERE NOT (child2.person_id = ANY(d.path))
      AND d.depth < 100
      AND pd2.is_deleted = false
)
SELECT * FROM descendants;
