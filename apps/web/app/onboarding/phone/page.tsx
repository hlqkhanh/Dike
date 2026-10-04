import { AuthShell } from '../../../components/auth/auth-shell';
import { PhoneForm } from './phone-form';

export default function PhoneOnboardingPage() {
  return (
    <AuthShell>
      <PhoneForm />
    </AuthShell>
  );
}
