import { AuthShell } from '../../../components/auth/auth-shell';
import { WorkflowGuard } from '../../../components/workflows/shared';
import { Vehicles } from '../../../components/workflows/member';
export default function Page() {
  return (
    <AuthShell>
      <WorkflowGuard>
        <Vehicles />
      </WorkflowGuard>
    </AuthShell>
  );
}
