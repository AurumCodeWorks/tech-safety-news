import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function Banner({ tone = 'info', children, action }: { tone?: 'info' | 'danger'; children: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'danger' ? IconAlertTriangle : IconInfoCircle;
  return (
    <div className={`banner ${tone === 'danger' ? 'danger' : ''}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}
