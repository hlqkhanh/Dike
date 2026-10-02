import { describe, expect, it } from 'vitest';

import { assertNonProduction, parseInteger } from '../src/index.js';

describe('shared config utilities', () => {
  it('parses bounded integers', () => {
    expect(parseInteger('5', 1, { min: 1, max: 10 })).toBe(5);
    expect(() => parseInteger('11', 1, { min: 1, max: 10 })).toThrow();
  });

  it('blocks destructive production operations', () => {
    expect(() => assertNonProduction('production', 'seed')).toThrow('seed is disabled');
    expect(() => assertNonProduction('local', 'seed')).not.toThrow();
  });
});
