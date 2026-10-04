import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { POLICY_VERSION } from '@dike/contracts';
import type { UserDocument } from '../src/auth/auth.types.js';
import {
  canReadProfile,
  literalNameQuery,
  privacyOf,
  projectProfile,
  validConsent,
} from '../src/users/profile.policy.js';
describe('profile privacy policy', () => {
  const user: UserDocument = {
    _id: new Types.ObjectId(),
    status: 'ACTIVE',
    displayName: 'Member',
    avatarUrl: null,
    phoneStatus: 'VERIFIED',
    phoneLookupHash: 'private-hash',
    roles: ['MEMBER', 'ADMIN'],
    roleVersion: 1,
    phoneVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  it('projects only allowed public profile fields and defaults discovery off', () => {
    expect(Object.keys(projectProfile(user)).sort()).toEqual(
      ['avatarUrl', 'bio', 'displayName', 'id', 'phoneVerified'].sort(),
    );
    expect(privacyOf(user).discoverable).toBe(false);
    expect(JSON.stringify(projectProfile(user))).not.toContain('private-hash');
  });
  it('checks owner, current visibility and status on every read', () => {
    expect(canReadProfile('other', user)).toBe(true);
    const privateUser = {
      ...user,
      privacy: { ...privacyOf(user), profileVisibility: 'PRIVATE' as const },
    };
    expect(canReadProfile('other', privateUser)).toBe(false);
    expect(canReadProfile(user._id.toHexString(), privateUser)).toBe(true);
    expect(canReadProfile(user._id.toHexString(), { ...user, status: 'DELETION_PENDING' })).toBe(
      false,
    );
  });
  it('escapes regex and excludes phone/email lookup', () => {
    expect(literalNameQuery('.*')).toBe('\\.\\*');
    expect(literalNameQuery('0901234567')).toBeNull();
    expect(literalNameQuery('a@example.com')).toBeNull();
    expect(literalNameQuery('  Nguyễn An  ')).toBe('Nguyễn An');
  });
  it('rejects outdated consent versions and requires both acknowledgements', () => {
    expect(validConsent(POLICY_VERSION, true, true)).toBe(true);
    expect(validConsent('old', true, true)).toBe(false);
    expect(validConsent(POLICY_VERSION, true, false)).toBe(false);
  });
});
