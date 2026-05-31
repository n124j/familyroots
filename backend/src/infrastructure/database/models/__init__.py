"""ORM model package — import all models here so Alembic autogenerate sees them."""

from src.infrastructure.database.models.tenant import TenantModel
from src.infrastructure.database.models.user import UserModel, UserOAuthProviderModel

__all__ = [
    "TenantModel",
    "UserModel",
    "UserOAuthProviderModel",
]
