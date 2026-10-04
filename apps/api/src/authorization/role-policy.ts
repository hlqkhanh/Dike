import type { AccountRole } from '@dike/contracts';
import type { UserDocument } from '../auth/auth.types.js';

export function effectiveRoles(
  user: Pick<UserDocument, 'status' | 'phoneStatus' | 'roles'>,
): AccountRole[] {
  if (user.status !== 'ACTIVE') return [];
  if (user.phoneStatus !== 'VERIFIED') return ['MEMBER'];
  return [...new Set<AccountRole>(['MEMBER', 'VERIFIED_MEMBER', ...(user.roles ?? [])])];
}

export interface RolePolicy {
  anyOf?: AccountRole[];
  allOf?: AccountRole[];
}

export function satisfiesRoles(roles: AccountRole[], policy: RolePolicy): boolean {
  const has = (role: AccountRole) =>
    roles.includes(role) || (role === 'MODERATOR' && roles.includes('ADMIN'));
  return (
    (!policy.anyOf?.length || policy.anyOf.some(has)) &&
    (!policy.allOf?.length || policy.allOf.every(has))
  );
}
