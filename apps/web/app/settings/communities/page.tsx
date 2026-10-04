import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { MyCommunities } from '../../../components/workflows/member';
export default function Page() {
  return (
    <AuthShell>
      <WorkflowGuard>
        <MyCommunities />
      </WorkflowGuard>
    </AuthShell>
  );
}
