"""Collaboration API — members, invitations, audit log, version history."""
from __future__ import annotations

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from src.api.deps import CurrentUserDep, UoWDep
from src.application.collaboration.service import CollaborationService
from src.domain.collaboration.entities import (
    Action, AuditEntityType, AuditEntry, Invitation,
    PersonVersion, TreeMembership, TreeRole,
)
from src.domain.collaboration.exceptions import (
    AlreadyMemberError, CannotDowngradeOwnerError, CannotRemoveOwnerError,
    InsufficientPermissionError, InvitationAlreadyUsedError,
    InvitationExpiredError, InvitationNotFoundError,
)

router = APIRouter(tags=["collaboration"])


# ── Dependency ─────────────────────────────────────────────────────────────────

async def get_collaboration_service(uow: UoWDep) -> CollaborationService:
    return CollaborationService(uow.session)

CollabDep = Annotated[CollaborationService, Depends(get_collaboration_service)]


# ── Schemas ────────────────────────────────────────────────────────────────────

class MemberResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    user_id: uuid.UUID
    role: TreeRole
    joined_at: Optional[str]

    @classmethod
    def from_domain(cls, m: TreeMembership) -> "MemberResponse":
        return cls(
            id=m.id,
            tree_id=m.tree_id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at.isoformat() if m.joined_at else None,
        )


class ChangeRoleRequest(BaseModel):
    role: TreeRole


class InviteRequest(BaseModel):
    email: EmailStr
    role: TreeRole = TreeRole.VIEWER
    message: Optional[str] = Field(None, max_length=500)


class InvitationResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    invitee_email: str
    role: TreeRole
    status: str
    expires_at: str
    created_at: str

    @classmethod
    def from_domain(cls, i: Invitation) -> "InvitationResponse":
        return cls(
            id=i.id,
            tree_id=i.tree_id,
            invitee_email=i.invitee_email,
            role=i.role,
            status=i.status.value,
            expires_at=i.expires_at.isoformat(),
            created_at=i.created_at.isoformat(),
        )


class AcceptInvitationRequest(BaseModel):
    token: str


class AuditEntryResponse(BaseModel):
    id: uuid.UUID
    actor_display_name: str
    action: str
    entity_type: str
    entity_id: Optional[uuid.UUID]
    entity_display_name: Optional[str]
    before: Optional[dict]
    after: Optional[dict]
    occurred_at: str

    @classmethod
    def from_domain(cls, e: AuditEntry) -> "AuditEntryResponse":
        return cls(
            id=e.id,
            actor_display_name=e.actor_display_name,
            action=e.action.value,
            entity_type=e.entity_type.value,
            entity_id=e.entity_id,
            entity_display_name=e.entity_display_name,
            before=e.before,
            after=e.after,
            occurred_at=e.occurred_at.isoformat(),
        )


class PersonVersionResponse(BaseModel):
    id: uuid.UUID
    version_number: int
    change_summary: str
    created_by_id: uuid.UUID
    created_at: str
    snapshot: dict

    @classmethod
    def from_domain(cls, v: PersonVersion) -> "PersonVersionResponse":
        return cls(
            id=v.id,
            version_number=v.version_number,
            change_summary=v.change_summary,
            created_by_id=v.created_by_id,
            created_at=v.created_at.isoformat(),
            snapshot=v.snapshot,
        )


# ── Members ────────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/members", response_model=list[MemberResponse])
async def list_members(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> list[MemberResponse]:
    members = await svc.list_members(tree_id, current_user.id)
    return [MemberResponse.from_domain(m) for m in members]


@router.patch("/trees/{tree_id}/members/{user_id}/role", status_code=status.HTTP_204_NO_CONTENT)
async def change_member_role(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ChangeRoleRequest,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> None:
    await svc.change_member_role(
        tree_id=tree_id,
        target_user_id=user_id,
        new_role=body.role,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        ip_address=request.client.host if request.client else None,
    )


@router.delete("/trees/{tree_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
    uow: UoWDep,
) -> None:
    await svc.remove_member(
        tree_id=tree_id,
        target_user_id=user_id,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


# ── Invitations ────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> list[InvitationResponse]:
    await svc.require_permission(tree_id, current_user.id, Action.VIEW_MEMBERS)
    from src.infrastructure.repositories.collaboration import InvitationRepository
    repo = InvitationRepository(svc._session)
    invitations = await repo.list_by_tree(tree_id)
    return [InvitationResponse.from_domain(i) for i in invitations]


@router.post("/trees/{tree_id}/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def send_invitation(
    tree_id: uuid.UUID,
    body: InviteRequest,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> InvitationResponse:
    invitation = await svc.send_invitation(
        tree_id=tree_id,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        invitee_email=body.email,
        role=body.role,
        message=body.message,
        ip_address=request.client.host if request.client else None,
    )
    # TODO: dispatch email via background task
    return InvitationResponse.from_domain(invitation)


@router.post("/invitations/accept", response_model=MemberResponse)
async def accept_invitation(
    body: AcceptInvitationRequest,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> MemberResponse:
    membership = await svc.accept_invitation(
        token=body.token,
        accepting_user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )
    return MemberResponse.from_domain(membership)


@router.delete("/trees/{tree_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(
    tree_id: uuid.UUID,
    invitation_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> None:
    await svc.revoke_invitation(
        invitation_id=invitation_id,
        tree_id=tree_id,
        actor_id=current_user.id,
        tenant_id=current_user.tenant_id,
        actor_name=current_user.display_name,
    )


# ── Audit log ──────────────────────────────────────────────────────────────────

@router.get("/trees/{tree_id}/audit-log", response_model=list[AuditEntryResponse])
async def get_audit_log(
    tree_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    entity_type: Optional[AuditEntityType] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    actor_id: Optional[uuid.UUID] = Query(None),
) -> list[AuditEntryResponse]:
    entries = await svc.get_audit_log(
        tree_id=tree_id,
        actor_id=current_user.id,
        limit=limit,
        offset=offset,
        entity_type=entity_type,
        entity_id=entity_id,
        filter_actor_id=actor_id,
    )
    return [AuditEntryResponse.from_domain(e) for e in entries]


# ── Version history ────────────────────────────────────────────────────────────

@router.get(
    "/trees/{tree_id}/persons/{person_id}/versions",
    response_model=list[PersonVersionResponse],
)
async def list_person_versions(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: CurrentUserDep,
    svc: CollabDep,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[PersonVersionResponse]:
    versions = await svc.get_person_history(
        person_id=person_id,
        tree_id=tree_id,
        actor_id=current_user.id,
        limit=limit,
        offset=offset,
    )
    return [PersonVersionResponse.from_domain(v) for v in versions]


@router.post(
    "/trees/{tree_id}/persons/{person_id}/versions/{version_number}/restore",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def restore_person_version(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    version_number: int,
    request: Request,
    current_user: CurrentUserDep,
    svc: CollabDep,
) -> None:
    snapshot = await svc.restore_person_version(
        person_id=person_id,
        tree_id=tree_id,
        version_number=version_number,
        actor_id=current_user.id,
        actor_name=current_user.display_name,
        tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )
    # TODO: apply snapshot to persons table via PersonRepository.update_from_snapshot(snapshot)
