import { AuthShell } from '../../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../../components/workflows/shared';
import { ReviewDetail } from '../../../../components/workflows/admin';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AuthShell>
      <WorkflowGuard admin>
        <ReviewDetail
          id={id}
          kind="vehicles"
          sandbox={['local', 'test'].includes(process.env.APP_ENV ?? '')}
        />
      </WorkflowGuard>
    </AuthShell>
  );
}
