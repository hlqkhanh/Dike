# Authentication threat model

## Assets and trust boundaries

- Google identity assertion and immutable provider subject.
- Dike access/refresh session tokens.
- Encrypted email and phone data.
- Browser → Next.js BFF is an internet trust boundary.
- Next.js BFF → NestJS API is authenticated with a signed, timestamped, single-use request.
- API → Google/Mock OIDC, MongoDB and Redis are separate service boundaries.

## Threats and controls

| Threat                          | Required control                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Login CSRF/code injection       | PKCE S256, one-time state, nonce, transaction cookie and atomic Redis consume                      |
| Open redirect                   | Exact relative-path allowlist; return path stored server-side                                      |
| Token theft through XSS         | Opaque token in Secure HttpOnly cookie; never local/session storage                                |
| CSRF on mutation                | SameSite cookie, exact Origin and double-submit CSRF token validated again by API where applicable |
| BFF impersonation/replay        | HMAC canonical request, timestamp window and Redis nonce                                           |
| Refresh replay                  | Atomic rotation, previous-token grace and device-session revocation after reuse                    |
| Session fixation                | Server creates new random access and refresh tokens after login/rotation                           |
| Account takeover by email/phone | Google `sub` is the only automatic identity key; conflicts require manual review                   |
| Database disclosure             | Token HMAC, AES-256-GCM PII encryption and independent keyrings                                    |
| IDOR during revoke              | Query by authenticated `userId` and requested `sessionId`                                          |
| Proxy/IP spoofing               | Exact trusted-proxy hop configuration; raw IP never persisted                                      |
| Sensitive logging               | Route path without query and explicit Pino redaction list                                          |
| Production backdoor             | Runtime rejects Mock OIDC and `REQUIRE_PHONE_OTP=false` in hosted environments                     |

## Deliberately unsupported

- Password authentication, implicit OAuth flow and browser-held Google tokens.
- Automatic account linking.
- Production phone verification before Stage 3.
- Mock provider outside local/test.

Review this model whenever a new identity provider, mobile client, account-linking workflow or privileged role is introduced.
