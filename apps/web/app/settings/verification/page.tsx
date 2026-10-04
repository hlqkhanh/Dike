import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { Verification } from '../../../components/workflows/member';
export default function Page() {
  return (
    <AuthShell>
      <WorkflowGuard>
        <Verification />
      </WorkflowGuard>
    </AuthShell>
  );
}
