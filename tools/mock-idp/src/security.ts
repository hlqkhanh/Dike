import { createHash } from 'node:crypto';

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function assertLocalEnvironment(environment: string): void {
  if (environment !== 'local' && environment !== 'test') {
    throw new Error('Mock OIDC provider is restricted to local/test environments');
  }
}
