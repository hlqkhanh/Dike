import {
  DEFAULT_PRIVACY,
  POLICY_VERSION,
  type ProfileView,
  type PrivacySettings,
} from '@dike/contracts';
import type { UserDocument } from '../auth/auth.types.js';

export function privacyOf(user: UserDocument): PrivacySettings {
  return user.privacy ?? { ...DEFAULT_PRIVACY };
}
export function canReadProfile(viewerId: string, user: UserDocument): boolean {
  return (
    user.status === 'ACTIVE' &&
    (viewerId === user._id.toHexString() || privacyOf(user).profileVisibility === 'MEMBERS')
  );
}
export function projectProfile(user: UserDocument): ProfileView {
  return {
    id: user._id.toHexString(),
    displayName: user.displayName,
    bio: user.bio ?? '',
    avatarUrl: user.avatarUrl,
    phoneVerified: user.phoneStatus === 'VERIFIED',
    identityStatus: user.identityStatus ?? 'NOT_SUBMITTED',
    identityMode: 'SANDBOX',
  };
}
export function literalNameQuery(query: string): string | null {
  const value = query.trim().normalize('NFC');
  if (value.length < 2 || value.length > 80 || /[\d@]/u.test(value)) return null;
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function validConsent(version: string, terms: boolean, privacy: boolean): boolean {
  return version === POLICY_VERSION && terms && privacy;
}
