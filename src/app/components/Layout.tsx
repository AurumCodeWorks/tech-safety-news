import { IconBan, IconBooks, IconLayoutDashboard, IconMail, IconMoon, IconSettings, IconSun, IconUsers } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { ink } from '../../shared/tokens';
import { SESSION_EXPIRED_EVENT } from '../api';
import { currentMode, setTheme } from '../theme';
import { Banner } from './Banner';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, end: true },
  { to: '/emails', label: 'Emails', icon: IconMail },
  { to: '/library', label: 'Card library', icon: IconBooks },
  { to: '/lists', label: 'Lists', icon: IconUsers },
  { to: '/suppressions', label: 'Suppressions', icon: IconBan },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(currentMode);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setMode(next);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo-light" src="/brand/logo-lockup-light.svg" alt="Enhanced Group Tech Safety News" width={190} height={38} />
          <img className="logo-dark" src="/brand/logo-lockup-dark.svg" alt="Enhanced Group Tech Safety News" width={190} height={38} />
        </div>
        <div className="rule" aria-hidden="true">
          <span style={{ background: ink.cyan }} />
          <span style={{ background: ink.magenta }} />
          <span style={{ background: ink.yellow }} />
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon size={20} stroke={1.75} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="button" onClick={toggle} aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {mode === 'dark' ? <IconSun size={18} aria-hidden="true" /> : <IconMoon size={18} aria-hidden="true" />}
            {mode === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>
      <main className="main">
        {expired && (
          <Banner tone="danger" action={<button type="button" className="button small" onClick={() => window.location.reload()}>Reload</button>}>
            Your session expired — reload to sign in
          </Banner>
        )}
        {children}
      </main>
    </div>
  );
}
