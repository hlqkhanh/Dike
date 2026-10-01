# ADR-0003: Google authentication followed by phone verification

- Status: Accepted
- Date: 2026-10-01
- Review: Before implementing Stage 2 and before enabling production OTP

## Context

The pilot needs low-friction sign-in and a verified contact channel. Development must not depend on paid OTP, while production must not accept demo identity shortcuts.

## Decision

Use Google Authorization Code with PKCE, state, and nonce. After the first sign-in, collect a phone number. Local/test may use a fake OTP provider behind an explicit environment guard. Production requires OTP verification before sensitive ride actions. Web sessions use opaque tokens in secure HttpOnly cookies; mobile later exchanges native Google credentials and stores session material in secure storage.

## Alternatives

- Password authentication: rejected due to password storage/recovery burden.
- Google-only: rejected because it does not verify a usable phone contact.
- Independent Google/OTP accounts: rejected initially because account linking increases takeover risk.

## Consequences

OAuth and OTP provider outages need explicit user-facing failure states. Account merge never occurs from unverified email/phone claims alone.

## Security impact

Rate limiting, replay prevention, short OTP lifetime, hashed OTP state, session revocation, CSRF/origin checks, audit events, and provider secret rotation are required. Production startup fails when fake providers are enabled.

## Migration and rollback

No demo header or legacy identity is supported. Provider adapters allow replacing Google/OTP vendors without changing domain authorization rules.
