import { Card } from '@dike/ui';

import { AuthShell } from '../../components/auth/auth-shell';

const errorMessages: Record<string, string> = {
  oauth_failed: 'Không thể hoàn tất đăng nhập. Vui lòng thử lại.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell>
      <Card className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Tài khoản Dike</p>
        <h1 id="login-title" className="auth-title">
          Đăng nhập an toàn
        </h1>
        <p className="lead auth-lead">
          Dike sử dụng Google để xác minh danh tính. Mật khẩu Google không bao giờ được gửi đến
          Dike.
        </p>
        {error && errorMessages[error] ? (
          <p className="form-error" role="alert">
            {errorMessages[error]}
          </p>
        ) : null}
        <a className="dike-button auth-action" href="/api/auth/google/start?returnTo=%2Fapp">
          Tiếp tục với Google
        </a>
        <p className="security-note">
          Phiên đăng nhập dùng cookie HttpOnly và có thể thu hồi riêng từng thiết bị.
        </p>
      </Card>
    </AuthShell>
  );
}
