import { AuthShell } from '../../components/auth/auth-shell';
import { Dashboard } from './dashboard';

export default function AppPage() {
  return (
    <AuthShell>
      <Dashboard />
    </AuthShell>
  );
}
