# ADR-0006: Protect the public repository and software supply chain

- Status: Accepted
- Date: 2026-10-01
- Review: Monthly during pilot preparation

## Context

The repository is public but does not grant an open-source license. Three team members need reproducible dependencies and protection against accidental secrets, malicious dependency changes, and unreviewed changes to `main`.

## Decision

Use pnpm with one frozen lockfile, Node.js 22, short-lived branches, pull requests, one independent approval, required CI/security checks, linear squash history, CODEOWNERS, Dependabot, dependency review, Secretlint, Gitleaks, CodeQL, and an SBOM. Pin GitHub Actions to full commit SHAs. Workflows use least-privilege tokens and never execute untrusted fork code with secrets.

## Alternatives

- Direct pushes: rejected because they bypass review and required checks.
- Floating action tags: rejected because tag movement can change CI code without repository review.
- Signed commits: deferred; GitHub identity, 2FA, PR review, and audit history are the current controls.

## Consequences

Maintenance and dependency updates require more review time. Emergency bypass is exceptional, time-limited, and documented.

## Security impact

All members use separate accounts and 2FA. Secrets never enter Git. High/critical production dependency findings block merge unless a documented exception expires within 30 days.

## Migration and rollback

The repository is greenfield. If a security tool becomes unavailable, replace it through a reviewed PR without weakening the required outcome.
