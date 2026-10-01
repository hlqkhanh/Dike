# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability and do not include credentials, personal data, identity documents, or precise location data in an issue or discussion.

Use GitHub Private Vulnerability Reporting for this repository. If private reporting is unavailable, contact a repository administrator privately and share only the minimum reproduction details required.

We aim to acknowledge a valid report within three business days. Acknowledgement is not a promise of a fix date. Severity, exploitability, affected users, and safe rollout requirements determine remediation priority.

## If a credential is exposed

1. Treat the credential as compromised; do not merely delete it from the latest commit.
2. Revoke or rotate it at the provider immediately.
3. Identify affected environments, logs, workflows, and dependent credentials.
4. Remove it from the working tree and Git history when appropriate.
5. Re-run secret scanning and document the incident without reproducing the secret.

## Supported versions

The project has not reached a production release. Only the default branch receives security fixes.

## Security boundaries

- Never commit `.env` files, provider credentials, private keys, OTP values, identity documents, or real user/location data.
- Do not enable fake OTP, fake eKYC, or demo identity shortcuts in production.
- Local hooks are advisory; GitHub CI and repository rules are authoritative.
- Security exceptions require an owner, mitigation, justification, and an expiry of at most 30 days.
