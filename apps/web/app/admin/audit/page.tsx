import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { AuditSearch } from '../../../components/workflows/admin';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initial =
    typeof params.resourceType === 'string' &&
    ['verification', 'vehicle', 'membership', 'community'].includes(params.resourceType) &&
    typeof params.resourceId === 'string' &&
    /^[a-f0-9]{24}$/i.test(params.resourceId)
      ? { type: params.resourceType, id: params.resourceId }
      : undefined;
  return (
    <AuthShell>
      <WorkflowGuard admin>
        <AuditSearch initial={initial} />
      </WorkflowGuard>
    </AuthShell>
  );
}
