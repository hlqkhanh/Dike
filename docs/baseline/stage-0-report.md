# Stage 0 completion report

Date: 2026-10-01

## Result

The local greenfield repository baseline is implemented. It contains repository
configuration, architecture decisions, security policy, developer tooling and CI
definitions only. Application source code, production credentials and legacy data
are intentionally absent.

The public repository is available at `https://github.com/hlqkhanh/Dike`. The owner
has chosen a lightweight trusted-team workflow: members with `Write` access may merge
their own work or push low-risk changes directly to `main`. CI and review remain
recommended controls but are not enforced as merge requirements.

## Baseline

- Branch: `main`.
- Initial commit subject: `chore: initialize greenfield repository`.
- Annotated baseline tag: `planning-v0.1.0`.
- The tag represents a planning/configuration baseline, not a recoverable prototype.
- The deleted prototype and demo JSON are not migration inputs.
- Runtime baseline: Node.js 22 and pnpm 10.17.1 through Corepack.

## Local controls implemented

- pnpm workspace boundaries for `apps/*` and `packages/*`.
- Exact tool versions and one frozen `pnpm-lock.yaml`.
- Dependency lifecycle scripts denied by default; no package is currently allowlisted.
- Strict shared TypeScript configuration, ESLint flat config and Prettier.
- Husky, lint-staged and Commitlint gates.
- Secretlint locally and Gitleaks in CI.
- CI jobs named `quality`, `test` and `build`, with read-only default permissions.
- CodeQL, dependency review, production dependency audit and CycloneDX SBOM workflows.
- Dependabot for npm and GitHub Actions dependencies.
- Seven accepted ADRs and a dependency-aware implementation backlog.
- Security, contribution, conduct, ownership and repository-recovery documentation.
- Public-repository templates and an all-rights-reserved notice.

## Verification evidence

- Frozen-lockfile installation completed successfully with lifecycle scripts disabled.
- A second frozen installation did not change the lockfile SHA-256:
  `DC5C3AFF6E4CA508891F6E703D5B53CBE26168ACFCAA65B7C173915BF7106BDA`.
- `corepack pnpm run ci` passed.
- `corepack pnpm security:audit` reported no known production vulnerabilities.
- `corepack pnpm sbom` generated a CycloneDX SBOM successfully; the local artifact is
  ignored and CI publishes it as an artifact.
- Repository and documentation scans found no credential, private key, connection
  string or personal user data. See `docs/security/initial-scan.md` for limitations.
- `dev`, `test` and `build` explicitly report that no application workspaces exist;
  application gates become active automatically when Stage 1 scaffolds them.
- All third-party GitHub Actions references use immutable full commit SHAs.

## Accepted ADRs

1. ADR-0001: modular monolith.
2. ADR-0002: MongoDB Atlas and Mongoose.
3. ADR-0003: authentication strategy.
4. ADR-0004: Cloudflare R2 file storage.
5. ADR-0005: deployment topology.
6. ADR-0006: repository and supply-chain security.
7. ADR-0007: lightweight collaboration, superseding ADR-0006 enforcement rules.

## GitHub-hosted status and pending administration

- Public repository, `main` and `planning-v0.1.0` exist on GitHub.
- Secret Scan and Dependency Audit completed successfully on the initial push.
- CI, CodeQL, Dependabot and dependency review remain enabled as advisory automation.
- No `main` protection ruleset or required approval/status checks are planned under
  the current lightweight workflow.
- The final collaborators still need to be invited with `Write` access and confirm
  separate accounts plus 2FA.
- `Admin` should remain with the owner and at most one recovery administrator.
- Private vulnerability reporting, secret scanning and push protection should be
  enabled where the repository settings make them available.
- GitHub milestones, labels and project-board views may be created from
  `docs/backlog.md`; they are coordination aids rather than merge gates.

## Risks carried into Stage 1

- Without branch protection, GitHub cannot stop a trusted member from pushing a
  failing change, force-pushing or deleting `main`; team policy and recovery practice
  are the controls.
- There are no application tests or builds until the Stage 1 workspaces are created.
- `CODEOWNERS` is advisory unless branch protection later requires its review. Owner
  placeholders must be replaced if the final team differs from the current owner.
- Cloud and deployment credentials must use environment separation and must never be
  committed; prefer short-lived or federated credentials when providers support them.
