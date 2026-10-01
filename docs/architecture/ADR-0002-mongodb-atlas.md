# ADR-0002: Use MongoDB Atlas

- Status: Accepted
- Date: 2026-10-01
- Review: Before production pilot and before any sharding decision

## Context

Dike needs flexible domain documents, geospatial candidate queries, unique constraints, and atomic booking workflows. Local and CI behavior must represent production transaction semantics.

## Decision

Use MongoDB Atlas in hosted environments and Mongoose in NestJS. Local/test uses a MongoDB replica set because multi-document transactions are not available on standalone MongoDB. GeoJSON fields use `2dsphere` indexes. Booking acceptance uses transactions plus conditional updates and writes an outbox event atomically.

## Alternatives

- PostgreSQL/PostGIS: viable but not selected for the current team plan.
- JSON files: rejected for concurrency, durability, access control, and query limitations.

## Consequences

Schemas and indexes must be versioned and tested. Transactions remain short. Routing is delegated to Goong; MongoDB does not calculate road routes.

## Security impact

Atlas network access, TLS, least-privilege users, credential rotation, encryption, backups, and audit visibility are mandatory. Application input must never become an unrestricted MongoDB query object.

## Migration and rollback

There is no legacy data migration. Synthetic seeds create local/test state. Schema/index changes require idempotent runners and documented rollback or forward-fix procedures.
