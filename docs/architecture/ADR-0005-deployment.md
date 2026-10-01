# ADR-0005: Deploy web on Vercel and services on Render

- Status: Accepted
- Date: 2026-10-01
- Review: Before production hardening and after pilot load testing

## Context

The project needs managed deployments suitable for a small team, including persistent API WebSockets and background jobs.

## Decision

Deploy Next.js on Vercel. Deploy NestJS API, BullMQ worker, and cron jobs on Render. Use Render's Redis-compatible key-value service, MongoDB Atlas, and Cloudflare R2. Keep local, test, staging, and production data and credentials separate.

## Alternatives

- Kubernetes: rejected as premature operational complexity.
- Single unmanaged VPS: rejected for the initial pilot because it increases patching, recovery, and service-management burden.

## Consequences

The architecture depends on multiple providers and their quotas. Clients must reconnect and resynchronize REST state after WebSocket interruption.

## Security impact

Use HTTPS/WSS, strict CORS allowlists, provider least privilege, environment-scoped secrets, protected production approvals, log redaction, backups, alerts, and credential rotation. Prefer short-lived OIDC deployment identity where supported.

## Migration and rollback

Infrastructure definitions and runbooks must permit redeployment. Every production release requires a rollback path; provider migration requires a superseding ADR.
