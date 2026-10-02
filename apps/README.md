# Applications

Stage 1 applications:

- `web`: Next.js App Router foundation shell and API health status.
- `api`: modular NestJS API, health/OpenAPI, MongoDB transaction/migration/seed and outbox persistence.
- `worker`: BullMQ worker and MongoDB outbox dispatcher with idempotent sample processing.

These applications intentionally contain no authentication or ride-sharing domain behavior yet.
