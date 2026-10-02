import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: ReactNode;
}

export function Button({ children, disabled, loading = false, ...props }: ButtonProps) {
  return (
    <button
      className="dike-button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span aria-hidden="true">↻</span> : null}
      <span>{loading ? 'Đang xử lý…' : children}</span>
    </button>
  );
}
