import { AuthShell } from '../../../components/auth/auth-shell';
import { ProfileSettings } from './profile-settings';
export default function ProfilePage() {
  return (
    <AuthShell>
      <ProfileSettings sandbox={['local', 'test'].includes(process.env.APP_ENV ?? 'local')} />
    </AuthShell>
  );
}
