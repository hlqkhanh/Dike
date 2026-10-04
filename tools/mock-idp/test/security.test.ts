import { describe, expect, it } from 'vitest';

import { assertLocalEnvironment, pkceChallenge } from '../src/security.js';

describe('mock OIDC security policy', () => {
  it('implements the RFC 7636 S256 example', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('refuses hosted environments', () => {
    expect(() => assertLocalEnvironment('local')).not.toThrow();
    expect(() => assertLocalEnvironment('test')).not.toThrow();
    expect(() => assertLocalEnvironment('staging')).toThrow('local/test');
    expect(() => assertLocalEnvironment('production')).toThrow('local/test');
  });
});
