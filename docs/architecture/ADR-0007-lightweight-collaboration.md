# ADR-0007: Lightweight collaboration for the trusted pilot team

- Status: Accepted; supersedes the collaboration enforcement in ADR-0006
- Date: 2026-10-01
- Review: Before production launch, after a repository incident, or when the team grows

## Context

ADR-0006 selected mandatory pull requests, independent approval and required status checks. The repository owner subsequently chose a lower-friction workflow for the current trusted three-person team. Supply-chain automation remains valuable, but GitHub enforcement is not required during this phase.

## Decision

Give developers `Write` access. They may use short-lived branches and pull requests, self-merge, or push small, low-risk changes directly to `main`. Pull requests and independent review are recommended for security-sensitive, data-model, infrastructure, dependency, workflow and cross-area changes but are not mandatory.

Keep commit hooks, CI, Secretlint, Gitleaks, CodeQL, dependency review/audit, Dependabot, immutable action SHAs and SBOM generation. Their results are advisory during normal development. The person pushing or merging a change owns any failure and its remediation.

Keep `Admin` access with the repository owner and at most one recovery administrator. `CODEOWNERS` remains an advisory ownership map. Do not force-push or delete `main` during normal work even though no branch ruleset technically prevents it.

## Alternatives

- Mandatory pull requests and required checks: rejected for now because they add coordination overhead the trusted team does not want.
- Giving every member `Admin`: rejected because ordinary development only requires `Write`, while `Admin` can change access, security settings and repository lifecycle.
- Removing CI/security automation: rejected because a relaxed merge flow should still expose quality and supply-chain risk.

## Consequences

Development has less friction, but GitHub cannot prevent a trusted member from pushing broken code or unsafe history to `main`. Team policy, clear ownership and repository recovery procedures become more important. The team must inspect failed Actions and must not promote a known security-critical failure to production.

## Security impact

All members use separate accounts and 2FA. Secrets never enter Git. High/critical production dependency findings must be fixed or covered by a documented exception before production release, even though they do not automatically block merge.

## Migration and rollback

No application migration is required. To restore stricter enforcement, create a new ADR, enable a `main` ruleset, require the selected CI checks and test the workflow with a pull request. Revoke or reduce access immediately if trust or account security changes.
