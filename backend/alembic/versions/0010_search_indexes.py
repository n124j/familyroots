"""Add full-text search vector and indexes for genealogy search.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-30
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TSVECTOR


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── pg_trgm extension (required for similarity() and GIN trigram indexes) ──
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")

    # ── search_vector generated column on persons ──────────────────────────────
    # Stored TSVECTOR updated by trigger (more reliable than GENERATED ALWAYS AS
    # for complex multi-column expressions in older Postgres versions).
    op.execute("""
        ALTER TABLE persons
        ADD COLUMN IF NOT EXISTS search_vector tsvector
    """)

    # Populate existing rows
    op.execute("""
        UPDATE persons SET search_vector =
            setweight(to_tsvector('simple', unaccent(coalesce(given_name, ''))), 'A')
            || setweight(to_tsvector('simple', unaccent(coalesce(surname, ''))), 'A')
            || setweight(to_tsvector('simple', unaccent(coalesce(maiden_name, ''))), 'B')
            || setweight(to_tsvector('simple', unaccent(coalesce(birth_place, ''))), 'C')
            || setweight(to_tsvector('simple', unaccent(coalesce(notes, ''))), 'D')
    """)

    # Trigger: keep search_vector fresh on INSERT / UPDATE
    op.execute("""
        CREATE OR REPLACE FUNCTION persons_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('simple', unaccent(coalesce(NEW.given_name, ''))), 'A')
                || setweight(to_tsvector('simple', unaccent(coalesce(NEW.surname, ''))), 'A')
                || setweight(to_tsvector('simple', unaccent(coalesce(NEW.maiden_name, ''))), 'B')
                || setweight(to_tsvector('simple', unaccent(coalesce(NEW.birth_place, ''))), 'C')
                || setweight(to_tsvector('simple', unaccent(coalesce(NEW.notes, ''))), 'D');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trg_persons_search_vector ON persons;
        CREATE TRIGGER trg_persons_search_vector
        BEFORE INSERT OR UPDATE OF given_name, surname, maiden_name, birth_place, notes
        ON persons
        FOR EACH ROW EXECUTE FUNCTION persons_search_vector_update()
    """)

    # ── GIN index on tsvector ──────────────────────────────────────────────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_search_vector
        ON persons USING GIN (search_vector)
        WHERE is_deleted = FALSE
    """)

    # ── Trigram indexes for fuzzy name matching ────────────────────────────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_given_trgm
        ON persons USING GIN (given_name gin_trgm_ops)
        WHERE is_deleted = FALSE
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_surname_trgm
        ON persons USING GIN (surname gin_trgm_ops)
        WHERE is_deleted = FALSE
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_maiden_trgm
        ON persons USING GIN (maiden_name gin_trgm_ops)
        WHERE maiden_name IS NOT NULL AND is_deleted = FALSE
    """)

    # ── Graph traversal indexes ────────────────────────────────────────────────
    # family_group_members: hot path for BFS ancestor/descendant CTEs
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_fgm_person_fg
        ON family_group_members (person_id, family_group_id, role)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_fgm_fg_role_person
        ON family_group_members (family_group_id, role, person_id)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_fgm_tree
        ON family_group_members (tree_id)
    """)

    # ── Scoping indexes ────────────────────────────────────────────────────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_tree_tenant
        ON persons (tree_id, tenant_id)
        WHERE is_deleted = FALSE
    """)

    # Birth year range filtering
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_birth_year
        ON persons (birth_year)
        WHERE birth_year IS NOT NULL AND is_deleted = FALSE
    """)

    # ── Composite: surname prefix search (common genealogy pattern) ────────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_persons_surname_prefix
        ON persons (tree_id, lower(surname) text_pattern_ops)
        WHERE is_deleted = FALSE
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_persons_search_vector ON persons")
    op.execute("DROP FUNCTION IF EXISTS persons_search_vector_update()")
    op.execute("DROP INDEX IF EXISTS idx_persons_search_vector")
    op.execute("DROP INDEX IF EXISTS idx_persons_given_trgm")
    op.execute("DROP INDEX IF EXISTS idx_persons_surname_trgm")
    op.execute("DROP INDEX IF EXISTS idx_persons_maiden_trgm")
    op.execute("DROP INDEX IF EXISTS idx_fgm_person_fg")
    op.execute("DROP INDEX IF EXISTS idx_fgm_fg_role_person")
    op.execute("DROP INDEX IF EXISTS idx_fgm_tree")
    op.execute("DROP INDEX IF EXISTS idx_persons_tree_tenant")
    op.execute("DROP INDEX IF EXISTS idx_persons_birth_year")
    op.execute("DROP INDEX IF EXISTS idx_persons_surname_prefix")
    op.execute("ALTER TABLE persons DROP COLUMN IF EXISTS search_vector")
