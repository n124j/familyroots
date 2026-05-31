"""Persons + genealogy relationship router — /api/v1/trees/{tree_id}/persons/*"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status

from src.api.deps import SessionDep, VerifiedUserDep
from src.application.genealogy.schemas import (
    AddChildRequest,
    AddParentRequest,
    AddSiblingRequest,
    AddSpouseRequest,
    AncestorsByGenerationResponse,
    KinshipResponse,
    LineagePathResponse,
    PersonDetailResponse,
)
from src.application.genealogy.service import FamilyTreeApplicationService

router = APIRouter(
    prefix="/trees/{tree_id}/persons",
    tags=["Persons & Relationships"],
)


def _svc(session: SessionDep) -> FamilyTreeApplicationService:
    return FamilyTreeApplicationService(session)


# ── Person detail ─────────────────────────────────────────────────

@router.get(
    "/{person_id}",
    response_model=PersonDetailResponse,
    summary="Get a person with their immediate relatives",
)
async def get_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> PersonDetailResponse:
    svc = _svc(session)
    return await svc.get_person(tree_id, user.tenant_id, person_id)


# ── Add parent ────────────────────────────────────────────────────

@router.post(
    "/{person_id}/parents",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Add a parent to a person",
)
async def add_parent(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddParentRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_parent(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Add child ─────────────────────────────────────────────────────

@router.post(
    "/{person_id}/children",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Add a child to a person",
)
async def add_child(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddChildRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_child(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Add spouse ────────────────────────────────────────────────────

@router.post(
    "/{person_id}/spouses",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Add a spouse / partner relationship",
)
async def add_spouse(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddSpouseRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_spouse(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Add sibling ───────────────────────────────────────────────────

@router.post(
    "/{person_id}/siblings",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Add a sibling relationship",
)
async def add_sibling(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    req: AddSiblingRequest,
    user: VerifiedUserDep,
    session: SessionDep,
) -> None:
    svc = _svc(session)
    await svc.add_sibling(tree_id, user.tenant_id, person_id, req)
    await session.commit()


# ── Relationship queries ──────────────────────────────────────────

@router.get(
    "/{person_id}/ancestors",
    response_model=AncestorsByGenerationResponse,
    summary="Get all ancestors grouped by generation",
)
async def get_ancestors(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
    max_depth: int = Query(default=100, ge=1, le=100),
) -> AncestorsByGenerationResponse:
    svc = _svc(session)
    return await svc.get_ancestors(tree_id, user.tenant_id, person_id, max_depth)


@router.get(
    "/{person_id}/descendants",
    response_model=AncestorsByGenerationResponse,
    summary="Get all descendants grouped by generation",
)
async def get_descendants(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
    max_depth: int = Query(default=100, ge=1, le=100),
) -> AncestorsByGenerationResponse:
    svc = _svc(session)
    return await svc.get_descendants(tree_id, user.tenant_id, person_id, max_depth)


@router.get(
    "/{person_id}/kinship/{other_person_id}",
    response_model=KinshipResponse,
    summary="Calculate the relationship between two persons",
)
async def get_kinship(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    other_person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> KinshipResponse:
    svc = _svc(session)
    return await svc.get_kinship(tree_id, user.tenant_id, person_id, other_person_id)


@router.get(
    "/{person_id}/lineage-paths/{other_person_id}",
    response_model=list[LineagePathResponse],
    summary="Find all relationship paths between two persons",
)
async def get_lineage_paths(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    other_person_id: uuid.UUID,
    user: VerifiedUserDep,
    session: SessionDep,
) -> list[LineagePathResponse]:
    svc = _svc(session)
    return await svc.get_lineage_paths(
        tree_id, user.tenant_id, person_id, other_person_id
    )
