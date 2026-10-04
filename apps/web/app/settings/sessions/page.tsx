import { AuthShell } from '../../../components/auth/auth-shell';
import { SessionManager } from './session-manager';

export default function SessionsPage() {
  return (
    <AuthShell>
      <SessionManager />
    </AuthShell>
  );
}
