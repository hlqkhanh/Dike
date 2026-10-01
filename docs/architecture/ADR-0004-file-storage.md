# ADR-0004: Use Cloudflare R2 for files

- Status: Accepted
- Date: 2026-10-01
- Review: Before collecting any real verification document

## Context

Dike needs public avatars and highly sensitive verification/vehicle documents. Storing file bytes in MongoDB would increase database backup size and complicate access separation.

## Decision

Use Cloudflare R2 through the S3-compatible API. Separate public avatar and private verification buckets. MongoDB stores metadata only. Clients upload with short-lived presigned requests; private downloads require a fresh authorization decision and short-lived signed URL.

## Alternatives

- MongoDB GridFS: rejected because it couples file volume to the primary database.
- Render persistent disk: rejected because it complicates horizontal scaling and recovery.

## Consequences

Upload lifecycle, orphan cleanup, retention, malware/content validation, and bucket policies become explicit application/operations responsibilities.

## Security impact

Private buckets deny public access. Object names do not contain phone numbers, identity numbers, or predictable user paths. MIME, size, ownership, expiry, and access are verified server-side. Real documents are prohibited until legal retention and incident processes are approved.

## Migration and rollback

Local development uses MinIO. The S3 adapter supports a future provider change; metadata migrations must preserve authorization and retention state.
