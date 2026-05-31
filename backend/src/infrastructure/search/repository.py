"""
Search repository — raw SQL queries for all four search modes.

All queries are tenant/tree scoped and guard against injection via
parameterised queries (no string interpolation of user input).
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Optional, Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.search.entities import (
    AncestorHit,
    AncestorQuery,
    BranchQuery,
    NameSearchQuery,
    PersonSearchHit,
    RelationshipPath,
    RelationshipQuery,
    RelativeQuery,
    SearchCategory,
    SearchResults,
    SortOrder,
    ancestor_label,
    descendant_label,
)

# ── Redis cache import (optional) ─────────────────────────────────────────────
try:
    import redis.asyncio as aioredis  # type: ignore
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

_CACHE_TTL = {
    "name":     120,    # 2 min
    "ancestor": 600,    # 10 min
    "branch":   600,
    "relative": 300,
}


class SearchRepository:
    def __init__(
        self,
        session: AsyncSession,
        redis: Optional[object] = None,   # aioredis.Redis instance
    ) -> None:
        self._session = session
        self._redis   = redis

    # ── Cache helpers ──────────────────────────────────────────────────────────

    def _cache_key(self, prefix: str, *parts: str) -> str:
        digest = hashlib.sha256(":".join(parts).encode()).hexdigest()[:16]
        return f"search:{prefix}:{digest}"

    async def _cache_get(self, key: str) -> Optional[str]:
        if self._redis and _REDIS_AVAILABLE:
            try:
                return await self._redis.get(key)
            except Exception:
                pass
        return None

    async def _cache_set(self, key: str, value: str, ttl: int) -> None:
        if self._redis and _REDIS_AVAILABLE:
            try:
                await self._redis.setex(key, ttl, value)
            except Exception:
                pass

    # ── 1. Name search ─────────────────────────────────────────────────────────

    async def name_search(self, q: NameSearchQuery) -> SearchResults:
        t0 = time.monotonic()

        # Cache check
        cache_key = self._cache_key(
            "name",
            str(q.tree_id or "global"),
            str(q.tenant_id),
            q.raw,
            str(q.birth_year_min),
            str(q.birth_year_max),
        )
        cached = await self._cache_get(cache_key)
        if cached:
            data = json.loads(cached)
            return SearchResults(
                query_type=SearchCategory.NAME,
                total=data["total"],
                hits=[PersonSearchHit(**h) for h in data["hits"]],
                took_ms=int((time.monotonic() - t0) * 1000),
            )

        raw = q.raw.strip()
        hits = await self._fts_query(q, raw)

        # Trigram fallback when FTS returns nothing
        if not hits and q.fuzzy and len(raw) >= 3:
            hits = await self._trigram_query(q, raw)

        await self._cache_set(
            cache_key,
            json.dumps({"total": len(hits), "hits": [_hit_to_dict(h) for h in hits]}),
            _CACHE_TTL["name"],
        )

        return SearchResults(
            query_type=SearchCategory.NAME,
            total=len(hits),
            hits=hits,
            took_ms=int((time.monotonic() - t0) * 1000),
        )

    async def _fts_query(
        self, q: NameSearchQuery, raw: str
    ) -> list[PersonSearchHit]:
        # Build tsquery — use plainto_tsquery for phrase, prefix for partial
        tsq_expr = "plainto_tsquery('simple', unaccent(:raw))"
        if not raw.endswith(" "):
            # Also try prefix query for the last word
            tsq_expr = (
                "plainto_tsquery('simple', unaccent(:raw)) || "
                "to_tsquery('simple', unaccent(:prefix_raw))"
            )

        tree_filter = "AND p.tree_id = :tree_id" if q.tree_id else ""
        birth_min   = "AND p.birth_year >= :birth_year_min" if q.birth_year_min else ""
        birth_max   = "AND p.birth_year <= :birth_year_max" if q.birth_year_max else ""

        order_clause = {
            SortOrder.RELEVANCE:  "score DESC, p.surname, p.given_name",
            SortOrder.NAME:       "p.surname, p.given_name",
            SortOrder.BIRTH_YEAR: "p.birth_year NULLS LAST",
            SortOrder.UPDATED_AT: "p.updated_at DESC",
        }.get(q.sort, "score DESC")

        sql = text(f"""
            SELECT
                p.id,
                p.tree_id,
                p.given_name,
                p.surname,
                p.maiden_name,
                p.birth_year,
                p.death_year,
                p.birth_place,
                p.is_living,
                ts_rank_cd(p.search_vector, tsq, 32) AS score
            FROM
                persons p,
                {tsq_expr} AS tsq
            WHERE
                p.tenant_id = :tenant_id
                AND p.is_deleted = FALSE
                AND p.search_vector @@ tsq
                {tree_filter}
                {birth_min}
                {birth_max}
            ORDER BY {order_clause}
            LIMIT :limit OFFSET :offset
        """)

        words = raw.split()
        last_word_prefix = words[-1] + ":*" if words else raw + ":*"

        params: dict = {
            "tenant_id": str(q.tenant_id),
            "raw": raw,
            "prefix_raw": last_word_prefix,
            "limit": q.limit,
            "offset": q.offset,
        }
        if q.tree_id:
            params["tree_id"] = str(q.tree_id)
        if q.birth_year_min:
            params["birth_year_min"] = q.birth_year_min
        if q.birth_year_max:
            params["birth_year_max"] = q.birth_year_max

        rows = (await self._session.execute(sql, params)).fetchall()
        return [_row_to_person_hit(r) for r in rows]

    async def _trigram_query(
        self, q: NameSearchQuery, raw: str
    ) -> list[PersonSearchHit]:
        """Fuzzy fallback using pg_trgm similarity on concatenated name."""
        tree_filter = "AND p.tree_id = :tree_id" if q.tree_id else ""

        sql = text(f"""
            SELECT
                p.id,
                p.tree_id,
                p.given_name,
                p.surname,
                p.maiden_name,
                p.birth_year,
                p.death_year,
                p.birth_place,
                p.is_living,
                greatest(
                    similarity(coalesce(p.given_name,'') || ' ' || coalesce(p.surname,''), :raw),
                    similarity(coalesce(p.surname,''), :raw),
                    similarity(coalesce(p.given_name,''), :raw)
                ) AS score
            FROM persons p
            WHERE
                p.tenant_id = :tenant_id
                AND p.is_deleted = FALSE
                AND greatest(
                    similarity(coalesce(p.given_name,'') || ' ' || coalesce(p.surname,''), :raw),
                    similarity(coalesce(p.surname,''), :raw),
                    similarity(coalesce(p.given_name,''), :raw)
                ) > 0.25
                {tree_filter}
            ORDER BY score DESC
            LIMIT :limit OFFSET :offset
        """)

        params: dict = {
            "tenant_id": str(q.tenant_id),
            "raw": raw,
            "limit": q.limit,
            "offset": q.offset,
        }
        if q.tree_id:
            params["tree_id"] = str(q.tree_id)

        rows = (await self._session.execute(sql, params)).fetchall()
        return [_row_to_person_hit(r) for r in rows]

    # ── 2. Ancestor BFS ────────────────────────────────────────────────────────

    async def ancestor_search(self, q: AncestorQuery) -> SearchResults:
        t0 = time.monotonic()

        cache_key = self._cache_key(
            "ancestor",
            str(q.tree_id),
            str(q.person_id),
            str(q.max_depth),
        )
        cached = await self._cache_get(cache_key)
        if cached:
            data = json.loads(cached)
            return SearchResults(
                query_type=SearchCategory.ANCESTOR,
                total=data["total"],
                ancestors=[AncestorHit(**a) for a in data["ancestors"]],
                took_ms=int((time.monotonic() - t0) * 1000),
            )

        sql = text("""
            WITH RECURSIVE ancestors AS (
                -- Base: direct parents
                SELECT
                    p.id            AS person_id,
                    p.given_name,
                    p.surname,
                    p.birth_year,
                    p.death_year,
                    p.is_living,
                    1               AS depth
                FROM persons p
                JOIN family_group_members fgm_c
                    ON fgm_c.person_id = :person_id
                    AND fgm_c.role = 'CHILD'
                    AND fgm_c.tree_id = :tree_id
                JOIN family_group_members fgm_p
                    ON fgm_p.family_group_id = fgm_c.family_group_id
                    AND fgm_p.role = 'PARENT'
                    AND fgm_p.person_id = p.id
                WHERE p.is_deleted = FALSE

                UNION

                -- Recursive: go up one generation
                SELECT
                    p2.id,
                    p2.given_name,
                    p2.surname,
                    p2.birth_year,
                    p2.death_year,
                    p2.is_living,
                    a.depth + 1
                FROM ancestors a
                JOIN family_group_members fgm_c2
                    ON fgm_c2.person_id = a.person_id
                    AND fgm_c2.role = 'CHILD'
                    AND fgm_c2.tree_id = :tree_id
                JOIN family_group_members fgm_p2
                    ON fgm_p2.family_group_id = fgm_c2.family_group_id
                    AND fgm_p2.role = 'PARENT'
                JOIN persons p2 ON p2.id = fgm_p2.person_id
                WHERE a.depth < :max_depth
                  AND p2.is_deleted = FALSE
            )
            SELECT DISTINCT ON (person_id) *
            FROM ancestors
            ORDER BY person_id, depth
        """)

        rows = (await self._session.execute(sql, {
            "person_id": str(q.person_id),
            "tree_id": str(q.tree_id),
            "max_depth": q.max_depth,
        })).fetchall()

        ancestors = [
            AncestorHit(
                person_id=uuid.UUID(r.person_id),
                given_name=r.given_name,
                surname=r.surname,
                birth_year=r.birth_year,
                death_year=r.death_year,
                depth=r.depth,
                relationship_label=ancestor_label(r.depth),
                is_living=r.is_living,
            )
            for r in rows
        ]

        payload = {"total": len(ancestors), "ancestors": [_ancestor_to_dict(a) for a in ancestors]}
        await self._cache_set(cache_key, json.dumps(payload), _CACHE_TTL["ancestor"])

        return SearchResults(
            query_type=SearchCategory.ANCESTOR,
            total=len(ancestors),
            ancestors=ancestors,
            took_ms=int((time.monotonic() - t0) * 1000),
        )

    # ── 3. Branch (descendants) ────────────────────────────────────────────────

    async def branch_search(self, q: BranchQuery) -> SearchResults:
        t0 = time.monotonic()

        cache_key = self._cache_key(
            "branch",
            str(q.tree_id),
            str(q.root_person_id),
            str(q.max_depth),
        )
        cached = await self._cache_get(cache_key)
        if cached:
            data = json.loads(cached)
            return SearchResults(
                query_type=SearchCategory.BRANCH,
                total=data["total"],
                ancestors=[AncestorHit(**a) for a in data["ancestors"]],
                took_ms=int((time.monotonic() - t0) * 1000),
            )

        sql = text("""
            WITH RECURSIVE branch AS (
                -- Base: root person
                SELECT
                    p.id            AS person_id,
                    p.given_name,
                    p.surname,
                    p.birth_year,
                    p.death_year,
                    p.is_living,
                    0               AS depth
                FROM persons p
                WHERE p.id = :root_id
                  AND p.tree_id = :tree_id
                  AND p.is_deleted = FALSE

                UNION

                -- Recursive: descend one generation
                SELECT
                    p2.id,
                    p2.given_name,
                    p2.surname,
                    p2.birth_year,
                    p2.death_year,
                    p2.is_living,
                    b.depth + 1
                FROM branch b
                JOIN family_group_members fgm_p
                    ON fgm_p.person_id = b.person_id
                    AND fgm_p.role = 'PARENT'
                    AND fgm_p.tree_id = :tree_id
                JOIN family_group_members fgm_c
                    ON fgm_c.family_group_id = fgm_p.family_group_id
                    AND fgm_c.role = 'CHILD'
                JOIN persons p2 ON p2.id = fgm_c.person_id
                WHERE b.depth < :max_depth
                  AND p2.is_deleted = FALSE
            )
            SELECT DISTINCT ON (person_id) *
            FROM branch
            WHERE depth > 0        -- exclude the root itself
            ORDER BY person_id, depth
        """)

        rows = (await self._session.execute(sql, {
            "root_id": str(q.root_person_id),
            "tree_id": str(q.tree_id),
            "max_depth": q.max_depth,
        })).fetchall()

        descendants = [
            AncestorHit(
                person_id=uuid.UUID(r.person_id),
                given_name=r.given_name,
                surname=r.surname,
                birth_year=r.birth_year,
                death_year=r.death_year,
                depth=r.depth,
                relationship_label=descendant_label(r.depth),
                is_living=r.is_living,
            )
            for r in rows
        ]

        payload = {"total": len(descendants), "ancestors": [_ancestor_to_dict(a) for a in descendants]}
        await self._cache_set(cache_key, json.dumps(payload), _CACHE_TTL["branch"])

        return SearchResults(
            query_type=SearchCategory.BRANCH,
            total=len(descendants),
            ancestors=descendants,
            took_ms=int((time.monotonic() - t0) * 1000),
        )

    # ── 4. Relationship path (BFS) ─────────────────────────────────────────────

    async def relationship_search(self, q: RelationshipQuery) -> SearchResults:
        """
        Find the shortest path between two people using bidirectional BFS.
        Implemented in Python over the adjacency data fetched from Postgres
        (cheaper than a PL/pgSQL BFS for short paths; Postgres CTE for long).
        """
        t0 = time.monotonic()

        if str(q.person_id_1) == str(q.person_id_2):
            return SearchResults(
                query_type=SearchCategory.RELATIONSHIP,
                total=0,
                relationship=RelationshipPath(
                    person_id_1=q.person_id_1,
                    person_id_2=q.person_id_2,
                    found=True,
                    distance=0,
                    path=[],
                    relationship_label="Same person",
                ),
                took_ms=0,
            )

        path = await self._bfs_relationship(q)

        return SearchResults(
            query_type=SearchCategory.RELATIONSHIP,
            total=1 if path.found else 0,
            relationship=path,
            took_ms=int((time.monotonic() - t0) * 1000),
        )

    async def _bfs_relationship(self, q: RelationshipQuery) -> RelationshipPath:
        """
        Python-level BFS using the adjacency list loaded from the DB.
        Loads all person↔family_group edges for the tree once, then does BFS.
        For very large trees the CTE approach would be preferable; this is
        efficient for typical pedigrees (< 10k nodes).
        """
        # Load full adjacency list for the tree
        adj_sql = text("""
            SELECT person_id, family_group_id, role
            FROM family_group_members
            WHERE tree_id = :tree_id
        """)
        rows = (await self._session.execute(adj_sql, {"tree_id": str(q.tree_id)})).fetchall()

        # Build: person → [(family_group_id, role)]
        # And:   family_group → [person_id]  (for navigation)
        from collections import defaultdict
        person_to_fgs: dict[str, list[tuple[str, str]]] = defaultdict(list)
        fg_to_persons: dict[str, list[str]] = defaultdict(list)

        for r in rows:
            person_to_fgs[r.person_id].append((r.family_group_id, r.role))
            fg_to_persons[r.family_group_id].append(r.person_id)

        # BFS from p1 toward p2
        start = str(q.person_id_1)
        end   = str(q.person_id_2)

        visited: dict[str, Optional[str]] = {start: None}  # node → predecessor
        queue: list[str] = [start]
        found = False

        for _ in range(q.max_depth * 2):  # each hop = 2 BFS levels (person→fg→person)
            if not queue:
                break
            next_queue: list[str] = []
            for pid in queue:
                for fg_id, _role in person_to_fgs.get(pid, []):
                    for neighbor in fg_to_persons.get(fg_id, []):
                        if neighbor not in visited:
                            visited[neighbor] = pid
                            if neighbor == end:
                                found = True
                                break
                            next_queue.append(neighbor)
                    if found:
                        break
                if found:
                    break
            if found:
                break
            queue = next_queue

        if not found:
            return RelationshipPath(
                person_id_1=q.person_id_1,
                person_id_2=q.person_id_2,
                found=False,
                distance=0,
                path=[],
                relationship_label=None,
            )

        # Reconstruct path
        path_ids: list[str] = []
        cur: Optional[str] = end
        while cur is not None:
            path_ids.append(cur)
            cur = visited.get(cur)
        path_ids.reverse()
        distance = len(path_ids) - 1

        # Fetch names for path nodes
        name_sql = text("""
            SELECT id, given_name, surname
            FROM persons
            WHERE id = ANY(:ids)
        """)
        name_rows = (await self._session.execute(
            name_sql, {"ids": path_ids}
        )).fetchall()
        name_map = {str(r.id): f"{r.given_name or ''} {r.surname or ''}".strip() for r in name_rows}

        path_steps = [
            {"person_id": pid, "name": name_map.get(pid, pid)}
            for pid in path_ids
        ]

        return RelationshipPath(
            person_id_1=q.person_id_1,
            person_id_2=q.person_id_2,
            found=True,
            distance=distance,
            path=path_steps,
            relationship_label=_degree_to_label(distance),
        )

    # ── 5. All relatives (bidirectional BFS) ──────────────────────────────────

    async def relative_search(self, q: RelativeQuery) -> SearchResults:
        t0 = time.monotonic()

        cache_key = self._cache_key(
            "relative",
            str(q.tree_id),
            str(q.person_id),
            str(q.max_hops),
        )
        cached = await self._cache_get(cache_key)
        if cached:
            data = json.loads(cached)
            return SearchResults(
                query_type=SearchCategory.RELATIVE,
                total=data["total"],
                ancestors=[AncestorHit(**a) for a in data["ancestors"]],
                took_ms=int((time.monotonic() - t0) * 1000),
            )

        # Uses a Postgres CTE that walks both up AND down from the person
        sql = text("""
            WITH RECURSIVE relatives AS (
                SELECT
                    p.id            AS person_id,
                    p.given_name,
                    p.surname,
                    p.birth_year,
                    p.death_year,
                    p.is_living,
                    0               AS hops
                FROM persons p
                WHERE p.id = :person_id
                  AND p.tree_id = :tree_id
                  AND p.is_deleted = FALSE

                UNION

                SELECT
                    p2.id,
                    p2.given_name,
                    p2.surname,
                    p2.birth_year,
                    p2.death_year,
                    p2.is_living,
                    r.hops + 1
                FROM relatives r
                JOIN family_group_members fgm1
                    ON fgm1.person_id = r.person_id
                    AND fgm1.tree_id = :tree_id
                JOIN family_group_members fgm2
                    ON fgm2.family_group_id = fgm1.family_group_id
                    AND fgm2.person_id != r.person_id
                JOIN persons p2 ON p2.id = fgm2.person_id
                WHERE r.hops < :max_hops
                  AND p2.is_deleted = FALSE
            )
            SELECT DISTINCT ON (person_id) *
            FROM relatives
            WHERE person_id != :person_id
            ORDER BY person_id, hops
        """)

        rows = (await self._session.execute(sql, {
            "person_id": str(q.person_id),
            "tree_id": str(q.tree_id),
            "max_hops": q.max_hops,
        })).fetchall()

        relatives = [
            AncestorHit(
                person_id=uuid.UUID(r.person_id),
                given_name=r.given_name,
                surname=r.surname,
                birth_year=r.birth_year,
                death_year=r.death_year,
                depth=r.hops,
                relationship_label=f"{r.hops} hop{'s' if r.hops != 1 else ''} away",
                is_living=r.is_living,
            )
            for r in rows
        ]

        payload = {"total": len(relatives), "ancestors": [_ancestor_to_dict(a) for a in relatives]}
        await self._cache_set(cache_key, json.dumps(payload), _CACHE_TTL["relative"])

        return SearchResults(
            query_type=SearchCategory.RELATIVE,
            total=len(relatives),
            ancestors=relatives,
            took_ms=int((time.monotonic() - t0) * 1000),
        )


# ── Serialisation helpers ──────────────────────────────────────────────────────

def _row_to_person_hit(r) -> PersonSearchHit:
    return PersonSearchHit(
        person_id=uuid.UUID(str(r.id)),
        tree_id=uuid.UUID(str(r.tree_id)),
        given_name=r.given_name,
        surname=r.surname,
        maiden_name=r.maiden_name,
        birth_year=r.birth_year,
        death_year=r.death_year,
        birth_place=r.birth_place,
        is_living=r.is_living,
        score=float(r.score or 0),
    )


def _hit_to_dict(h: PersonSearchHit) -> dict:
    return {
        "person_id": str(h.person_id),
        "tree_id": str(h.tree_id),
        "given_name": h.given_name,
        "surname": h.surname,
        "maiden_name": h.maiden_name,
        "birth_year": h.birth_year,
        "death_year": h.death_year,
        "birth_place": h.birth_place,
        "is_living": h.is_living,
        "score": h.score,
        "matched_fields": h.matched_fields,
    }


def _ancestor_to_dict(a: AncestorHit) -> dict:
    return {
        "person_id": str(a.person_id),
        "given_name": a.given_name,
        "surname": a.surname,
        "birth_year": a.birth_year,
        "death_year": a.death_year,
        "depth": a.depth,
        "relationship_label": a.relationship_label,
        "is_living": a.is_living,
    }


def _degree_to_label(distance: int) -> str:
    """Rough heuristic label based on graph distance (hops through family groups)."""
    labels = {
        0: "Same person",
        1: "Spouse or sibling",
        2: "Parent, child, or step-sibling",
        3: "Grandparent/grandchild or aunt/uncle",
        4: "1st cousin or great-grandparent/child",
        5: "1st cousin once removed",
        6: "2nd cousin",
    }
    return labels.get(distance, f"Distant relative ({distance} hops)")
