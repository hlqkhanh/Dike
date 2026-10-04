import { AuthShell } from '../../components/auth/auth-shell';
import { People } from './people';
export default function PeoplePage() {
  return (
    <AuthShell>
      <People />
    </AuthShell>
  );
}
