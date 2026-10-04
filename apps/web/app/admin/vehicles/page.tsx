import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { ReviewQueue } from '../../../components/workflows/admin';
export default function Page() {
  return (
    <AuthShell>
      <WorkflowGuard admin>
        <ReviewQueue kind="vehicles" />
      </WorkflowGuard>
    </AuthShell>
  );
}
