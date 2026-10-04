import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';

import { ApiError } from '../common/api-error.js';
import { API_CONFIG } from '../common/tokens.js';
import type { ApiConfig } from '../config/api-config.js';
import type { VerifiedIdentity } from './auth.types.js';

interface ProviderMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

@Injectable()
export class IdentityProviderService {
  private metadata?: ProviderMetadata;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  codeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  async createAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): Promise<string> {
    const metadata = await this.getMetadata();
    const url = new URL(metadata.authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: this.config.GOOGLE_CLIENT_ID,
      redirect_uri: this.config.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'online',
    }).toString();
    return url.toString();
  }

  async exchange(input: {
    code: string;
    verifier: string;
    nonce: string;
    redirectUri: string;
  }): Promise<VerifiedIdentity> {
    const metadata = await this.getMetadata();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
      response = await fetch(metadata.tokenEndpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          client_id: this.config.GOOGLE_CLIENT_ID,
          client_secret: this.config.GOOGLE_CLIENT_SECRET,
          redirect_uri: input.redirectUri,
          code_verifier: input.verifier,
        }),
      });
    } catch {
      throw new ApiError('OAUTH_CODE_INVALID', 'Unable to complete sign in', 401);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new ApiError('OAUTH_CODE_INVALID', 'Unable to complete sign in', 401);
    }
    const tokenResponse = (await response.json()) as { id_token?: unknown };
    if (typeof tokenResponse.id_token !== 'string') {
      throw new ApiError('IDENTITY_TOKEN_INVALID', 'Unable to verify identity', 401);
    }

    try {
      const jwks = createRemoteJWKSet(new URL(metadata.jwksUri), {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      });
      const { payload, protectedHeader } = await jwtVerify(tokenResponse.id_token, jwks, {
        issuer: metadata.issuer,
        audience: this.config.GOOGLE_CLIENT_ID,
        algorithms: ['RS256'],
        clockTolerance: 60,
      });
      if (protectedHeader.alg !== 'RS256' || payload.nonce !== input.nonce) {
        throw new Error('OIDC nonce or algorithm mismatch');
      }
      if (payload.azp !== undefined && payload.azp !== this.config.GOOGLE_CLIENT_ID) {
        throw new Error('OIDC authorized party mismatch');
      }
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string' ||
        payload.email_verified !== true
      ) {
        throw new Error('OIDC identity claims are incomplete');
      }
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const picture = typeof payload.picture === 'string' ? payload.picture : null;
      return {
        subject: payload.sub,
        email: payload.email,
        emailVerified: true,
        displayName: name || 'Dike member',
        avatarUrl: picture && picture.startsWith('https://') ? picture : null,
      };
    } catch (error) {
      if (error instanceof joseErrors.JOSEError || error instanceof Error) {
        throw new ApiError('IDENTITY_TOKEN_INVALID', 'Unable to verify identity', 401);
      }
      throw error;
    }
  }

  private async getMetadata(): Promise<ProviderMetadata> {
    if (this.metadata) return this.metadata;
    if (this.config.AUTH_PROVIDER === 'google') {
      this.metadata = {
        issuer: 'https://accounts.google.com',
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      };
      return this.metadata;
    }
    const issuer = this.config.MOCK_OIDC_ISSUER.replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Mock OIDC discovery failed');
      const discovery = (await response.json()) as Record<string, unknown>;
      if (
        discovery.issuer !== issuer ||
        typeof discovery.authorization_endpoint !== 'string' ||
        typeof discovery.token_endpoint !== 'string' ||
        typeof discovery.jwks_uri !== 'string'
      ) {
        throw new Error('Mock OIDC metadata is invalid');
      }
      this.metadata = {
        issuer,
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        jwksUri: discovery.jwks_uri,
      };
      return this.metadata;
    } finally {
      clearTimeout(timeout);
    }
  }
}
