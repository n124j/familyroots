"""Collaboration domain entities: roles, permissions, invitations, audit."""
from __future__ import annotations

import uuid
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Optional


# ── Enumerations ──────────────────────────────────────────────────────────────

class AppRole(str, Enum):
    ADMIN    = "ADMIN"    # System-wide superuser — bypasses all tree membership checks
    STANDARD = "STANDARD" # Normal user (default)
    AUDITOR  = "AUDITOR"  # Read-only access to all trees; cannot modify anything


class TreeRole(str, Enum):
    OWNER  = "OWNER"    # Full control including delete tree & transfer ownership
    ADMIN  = "ADMIN"    # Manage members, all data edits, view audit log
    EDITOR = "EDITOR"   # Add/edit/delete persons, events, media
    VIEWER = "VIEWER"   # Read-only; cannot see audit logs


class Action(str, Enum):
    """All operations that can be authorised and audited."""
    # Tree-level
    DELETE_TREE         = "DELETE_TREE"
    TRANSFER_OWNERSHIP  = "TRANSFER_OWNERSHIP"
    UPDATE_TREE         = "UPDATE_TREE"
    # Member management
    INVITE_MEMBER       = "INVITE_MEMBER"
    REMOVE_MEMBER       = "REMOVE_MEMBER"
    CHANGE_MEMBER_ROLE  = "CHANGE_MEMBER_ROLE"
    VIEW_MEMBERS        = "VIEW_MEMBERS"
    # Audit
    VIEW_AUDIT_LOG      = "VIEW_AUDIT_LOG"
    # Persons
    CREATE_PERSON       = "CREATE_PERSON"
    UPDATE_PERSON       = "UPDATE_PERSON"
    DELETE_PERSON       = "DELETE_PERSON"
    VIEW_PERSON         = "VIEW_PERSON"
    # Relationships
    ADD_RELATIONSHIP    = "ADD_RELATIONSHIP"
    REMOVE_RELATIONSHIP = "REMOVE_RELATIONSHIP"
    # Events
    CREATE_EVENT        = "CREATE_EVENT"
    UPDATE_EVENT        = "UPDATE_EVENT"
    DELETE_EVENT        = "DELETE_EVENT"
    # Media
    UPLOAD_MEDIA        = "UPLOAD_MEDIA"
    DELETE_MEDIA        = "DELETE_MEDIA"
    # Version history
    VIEW_VERSION        = "VIEW_VERSION"
    RESTORE_VERSION     = "RESTORE_VERSION"
    # Reports
    GENERATE_REPORT     = "GENERATE_REPORT"
    EXPORT_GEDCOM       = "EXPORT_GEDCOM"
    # Tree backup
    EXPORT_TREE         = "EXPORT_TREE"
    IMPORT_TREE         = "IMPORT_TREE"
    # Photo
    UPDATE_PHOTO        = "UPDATE_PHOTO"


class InvitationStatus(str, Enum):
    PENDING  = "PENDING"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    EXPIRED  = "EXPIRED"
    REVOKED  = "REVOKED"


class AuditEntityType(str, Enum):
    TREE          = "TREE"
    PERSON        = "PERSON"
    FAMILY_GROUP  = "FAMILY_GROUP"
    EVENT         = "EVENT"
    MEDIA         = "MEDIA"
    MEMBER        = "MEMBER"
    INVITATION    = "INVITATION"
    REPORT        = "REPORT"


# ── Permission matrix ─────────────────────────────────────────────────────────

#: Maps each Action to the minimum role required to perform it.
#: Any role >= the minimum in the hierarchy (OWNER > ADMIN > EDITOR > VIEWER) is allowed.
ROLE_HIERARCHY: dict[TreeRole, int] = {
    TreeRole.OWNER:  4,
    TreeRole.ADMIN:  3,
    TreeRole.EDITOR: 2,
    TreeRole.VIEWER: 1,
}

ACTION_MIN_ROLE: dict[Action, TreeRole] = {
    # Owner-only
    Action.DELETE_TREE:         TreeRole.OWNER,
    Action.TRANSFER_OWNERSHIP:  TreeRole.OWNER,
    # Admin+
    Action.INVITE_MEMBER:       TreeRole.ADMIN,
    Action.REMOVE_MEMBER:       TreeRole.ADMIN,
    Action.CHANGE_MEMBER_ROLE:  TreeRole.ADMIN,
    Action.UPDATE_TREE:         TreeRole.ADMIN,
    Action.VIEW_AUDIT_LOG:      TreeRole.ADMIN,
    Action.RESTORE_VERSION:     TreeRole.ADMIN,
    # Editor+
    Action.CREATE_PERSON:       TreeRole.EDITOR,
    Action.UPDATE_PERSON:       TreeRole.EDITOR,
    Action.DELETE_PERSON:       TreeRole.EDITOR,
    Action.ADD_RELATIONSHIP:    TreeRole.EDITOR,
    Action.REMOVE_RELATIONSHIP: TreeRole.EDITOR,
    Action.CREATE_EVENT:        TreeRole.EDITOR,
    Action.UPDATE_EVENT:        TreeRole.EDITOR,
    Action.DELETE_EVENT:        TreeRole.EDITOR,
    Action.UPLOAD_MEDIA:        TreeRole.EDITOR,
    Action.DELETE_MEDIA:        TreeRole.EDITOR,
    Action.GENERATE_REPORT:     TreeRole.EDITOR,
    Action.EXPORT_GEDCOM:       TreeRole.EDITOR,
    # Viewer+
    Action.VIEW_PERSON:         TreeRole.VIEWER,
    Action.VIEW_MEMBERS:        TreeRole.VIEWER,
    Action.VIEW_VERSION:        TreeRole.VIEWER,
}


def is_permitted(role: TreeRole, action: Action) -> bool:
    """Return True if *role* is sufficient to perform *action*."""
    min_role = ACTION_MIN_ROLE.get(action)
    if min_role is None:
        return False
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min_role]


# ── Domain entities ───────────────────────────────────────────────────────────

@dataclass
class TreeMembership:
    """A user's membership in a family tree."""
    id: uuid.UUID
    tree_id: uuid.UUID
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    role: TreeRole
    invited_by_id: Optional[uuid.UUID] = None
    joined_at: Optional[datetime] = None

    def can(self, action: Action) -> bool:
        return is_permitted(self.role, action)

    def require(self, action: Action) -> None:
        """Raise InsufficientPermissionError if not permitted."""
        from src.domain.collaboration.exceptions import InsufficientPermissionError
        if not self.can(action):
            raise InsufficientPermissionError(action, self.role)


@dataclass
class Invitation:
    """A pending invitation to join a family tree."""
    id: uuid.UUID
    tree_id: uuid.UUID
    tenant_id: uuid.UUID
    inviter_id: uuid.UUID
    invitee_email: str
    role: TreeRole
    token: str                  # URL-safe secret token
    status: InvitationStatus
    expires_at: datetime
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    accepted_at: Optional[datetime] = None
    message: Optional[str] = None

    @classmethod
    def create(
        cls,
        tree_id: uuid.UUID,
        tenant_id: uuid.UUID,
        inviter_id: uuid.UUID,
        invitee_email: str,
        role: TreeRole,
        ttl_hours: int = 72,
        message: Optional[str] = None,
    ) -> "Invitation":
        now = datetime.now(timezone.utc)
        return cls(
            id=uuid.uuid4(),
            tree_id=tree_id,
            tenant_id=tenant_id,
            inviter_id=inviter_id,
            invitee_email=invitee_email.lower().strip(),
            role=role,
            token=secrets.token_urlsafe(32),
            status=InvitationStatus.PENDING,
            expires_at=now + timedelta(hours=ttl_hours),
            created_at=now,
            message=message,
        )

    @property
    def is_valid(self) -> bool:
        return (
            self.status == InvitationStatus.PENDING
            and datetime.now(timezone.utc) < self.expires_at
        )


@dataclass
class AuditEntry:
    """An immutable record of a single action on the tree."""
    id: uuid.UUID
    tree_id: uuid.UUID
    tenant_id: uuid.UUID
    actor_id: uuid.UUID
    actor_display_name: str
    action: Action
    entity_type: AuditEntityType
    entity_id: Optional[uuid.UUID]
    entity_display_name: Optional[str]
    # JSON-serialisable snapshots (None if not applicable)
    before: Optional[dict[str, Any]]
    after: Optional[dict[str, Any]]
    ip_address: Optional[str]
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        tree_id: uuid.UUID,
        tenant_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_display_name: str,
        action: Action,
        entity_type: AuditEntityType,
        entity_id: Optional[uuid.UUID] = None,
        entity_display_name: Optional[str] = None,
        before: Optional[dict] = None,
        after: Optional[dict] = None,
        ip_address: Optional[str] = None,
        **metadata: Any,
    ) -> "AuditEntry":
        return cls(
            id=uuid.uuid4(),
            tree_id=tree_id,
            tenant_id=tenant_id,
            actor_id=actor_id,
            actor_display_name=actor_display_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_display_name=entity_display_name,
            before=before,
            after=after,
            ip_address=ip_address,
            metadata=metadata,
        )


@dataclass
class PersonVersion:
    """A point-in-time snapshot of a person's data."""
    id: uuid.UUID
    person_id: uuid.UUID
    tree_id: uuid.UUID
    tenant_id: uuid.UUID
    version_number: int              # monotonically increasing per person
    snapshot: dict[str, Any]        # full person JSON at this point
    audit_entry_id: Optional[uuid.UUID]   # links to the AuditEntry that caused this version
    created_by_id: uuid.UUID
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    change_summary: str = ""

    @property
    def is_current(self) -> bool:
        """True if this is the latest version (determined externally)."""
        return False  # set by repository / service


@dataclass
class OAuthConnection:
    """A link between a local user and an external OAuth provider identity."""
    id: uuid.UUID
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    provider: str           # "google" | "github"
    provider_user_id: str
    email: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    access_token_hint: Optional[str]   # masked; stored encrypted in infra
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: Optional[datetime] = None
