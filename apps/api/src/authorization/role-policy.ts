import type { AccountRole } from '@dike/contracts';
import type { UserDocument } from '../auth/auth.types.js';

export function effectiveRoles(
  user: Pick<
    UserDocument,
    'status' | 'phoneStatus' | 'roles' | 'identityStatus' | 'identityMode' | 'approvedVehicleCount'
  >,
): AccountRole[] {
  if (user.status !== 'ACTIVE') return [];
  if (user.phoneStatus !== 'VERIFIED') return ['MEMBER'];
  const roles: AccountRole[] = [
    'MEMBER',
    ...(user.roles ?? []).filter((role) => role === 'ADMIN' || role === 'MODERATOR'),
  ];
  if (user.identityStatus === 'VERIFIED' && user.identityMode === 'SANDBOX') {
    roles.push('VERIFIED_MEMBER');
    if ((user.approvedVehicleCount ?? 0) > 0) roles.push('APPROVED_DRIVER');
  }
  return [...new Set(roles)];
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
