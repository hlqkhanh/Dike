import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { AdminCommunities } from '../../../components/workflows/admin';
export default function Page() {
  return (
    <AuthShell>
      <WorkflowGuard admin>
        <AdminCommunities />
      </WorkflowGuard>
    </AuthShell>
  );
}
