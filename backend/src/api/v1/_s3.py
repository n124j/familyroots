"""Shared S3 / presigned-URL helpers used by multiple API modules."""
from __future__ import annotations

from typing import Optional


def _make_s3_client(settings):
    """S3 client for API operations (upload, delete). Uses the internal endpoint URL."""
    import boto3
    from botocore.config import Config as BotoCfg

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.aws_access_key_id or "minioadmin",
        aws_secret_access_key=settings.aws_secret_access_key or "minioadmin",
        region_name=settings.aws_region,
        config=BotoCfg(signature_version="s3v4"),
    )


def _make_presign_client(settings):
    """S3 client used only for generating presigned GET URLs.

    Uses S3_PUBLIC_URL (browser-accessible) instead of S3_ENDPOINT_URL (internal
    Docker network) so the generated URL works in a browser.  Falls back to
    S3_ENDPOINT_URL when S3_PUBLIC_URL is not configured (e.g. production AWS S3
    where both values are absent and boto3 uses the default AWS endpoint).
    """
    import boto3
    from botocore.config import Config as BotoCfg

    endpoint = (settings.s3_public_url or settings.s3_endpoint_url or "").rstrip("/") or None

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.aws_access_key_id or "minioadmin",
        aws_secret_access_key=settings.aws_secret_access_key or "minioadmin",
        region_name=settings.aws_region,
        config=BotoCfg(signature_version="s3v4"),
    )


def presign_photo(photo_url: Optional[str], expires_in: int = 3600) -> Optional[str]:
    """Return a browser-accessible URL for a person photo.

    Handles three storage formats:
    - None / empty          → None
    - preset:N              → returned as-is (data URI resolved client-side)
    - bare S3 key           → presigned GET URL using the public endpoint
    - legacy full URL       → key extracted, then presigned GET URL
    """
    if not photo_url or photo_url.startswith("preset:"):
        return photo_url

    from src.config import get_settings
    settings = get_settings()
    bucket = settings.s3_bucket or "familyroots-local"

    # Extract key from legacy full-URL storage format (either endpoint variant)
    for base in filter(None, [
        (settings.s3_public_url or "").rstrip("/"),
        (settings.s3_endpoint_url or "").rstrip("/"),
    ]):
        prefix = f"{base}/{bucket}/"
        if photo_url.startswith(prefix):
            photo_url = photo_url[len(prefix):]
            break
    else:
        if photo_url.startswith("/"):
            stripped = photo_url.lstrip("/")
            photo_url = stripped[len(bucket) + 1:] if stripped.startswith(f"{bucket}/") else stripped
        # else: already a bare key — leave as-is

    s3 = _make_presign_client(settings)
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": photo_url},
        ExpiresIn=expires_in,
    )
