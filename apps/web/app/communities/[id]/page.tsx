import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { CommunityDetail } from '../../../components/workflows/member';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AuthShell>
      <WorkflowGuard>
        <CommunityDetail id={id} />
      </WorkflowGuard>
    </AuthShell>
  );
}
