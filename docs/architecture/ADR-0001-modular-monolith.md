# ADR-0001: Use a modular monolith

- Status: Accepted
- Date: 2026-10-01
- Review: Before exceeding pilot scale or splitting a separately owned service

## Context

The three-person team must implement transaction-heavy booking behavior for a pilot of at most roughly 500 users. Distributed transactions, independent service deployment, and cross-service authorization would add risk without a proven scaling need.

## Decision

Build one NestJS API divided into explicit domain modules. Run BullMQ workers as a separate process from the same monorepo and contracts. Keep module boundaries enforceable and avoid cross-module database access outside declared services/repositories.

## Alternatives

- Microservices: rejected for pilot complexity and operational overhead.
- Single unstructured service: rejected because it hides ownership and creates unsafe coupling.

## Consequences

Deployment and transactions remain simple. A poorly enforced module boundary could still create a large coupled codebase, so architecture tests and code review are required.

## Security impact

Authorization policies remain centralized and auditable. A compromised process has broader access than a narrowly scoped microservice, so least-privilege database/provider credentials and strict module policies remain necessary.

## Migration and rollback

No legacy code is migrated. A future ADR may extract a module only after measuring load, ownership, and failure isolation requirements.
