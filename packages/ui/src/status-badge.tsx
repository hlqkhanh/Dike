export interface StatusBadgeProps {
  status: 'ready' | 'loading' | 'warning' | 'error';
  children: string;
}

const icons = { ready: '✓', loading: '…', warning: '!', error: '×' } as const;

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span className="dike-status" data-status={status} role="status">
      <span aria-hidden="true">{icons[status]}</span> {children}
    </span>
  );
}
