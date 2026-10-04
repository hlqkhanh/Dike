import type { ReactNode } from 'react';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="shell header">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>{' '}
          Dike
        </a>
        <small>Đăng nhập và session an toàn</small>
      </header>
      <main className="shell auth-main">{children}</main>
    </>
  );
}
