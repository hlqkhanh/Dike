# Authentication operations

## Local development

`corepack pnpm dev` creates missing local secrets, starts MongoDB/Redis/MinIO, applies migrations and runs the Mock OIDC provider, API, worker and web.

The Mock OIDC page is visibly marked local/test and contains synthetic `.invalid` accounts only. It performs a real redirect, one-time authorization code, nonce and PKCE S256 exchange; it is not an identity header shortcut.

## Google configuration

1. Create an OAuth 2.0 Web application in Google Cloud.
2. Register the exact callback URI, for example `https://app.example.com/api/auth/google/callback`.
3. Set `AUTH_PROVIDER=google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in the secret manager.
4. Set `WEB_BASE_URL` and `API_INTERNAL_URL`; the latter should resolve over a private network where available.
5. Keep scopes limited to `openid email profile`; Dike does not need Google offline access.
6. Run `corepack pnpm dev:google` locally for the manual smoke test.

Never commit a Google secret or place it in a `NEXT_PUBLIC_` variable.

## Key rotation

Each keyring is a JSON object keyed by key ID. Add the new key alongside the old key, deploy readers, switch the active key ID, and only remove the old key after all corresponding sessions or encrypted values are expired/re-encrypted. Session, PII, CSRF and BFF keys are independent and must never reuse material.

## Incident response

- For suspected refresh-token reuse, inspect sanitized `AUTH_REFRESH_REUSE` audit records and revoke the affected user sessions.
- For broad session compromise, revoke all active sessions and rotate the auth/CSRF keys.
- For BFF key compromise, add a replacement key, deploy both readers, switch the active ID, then remove the compromised key.
- Do not export database dumps, cookies or Playwright traces into tickets.
- Google outage must not make liveness fail; login returns a generic unavailable message and existing Dike sessions continue until their normal expiry.

## Production gate

Hosted configuration requires HTTPS, secure cookies, real Google OIDC and `REQUIRE_PHONE_OTP=true`. Stage 2 does not implement OTP delivery, so product actions requiring a verified phone remain blocked until Stage 3.
