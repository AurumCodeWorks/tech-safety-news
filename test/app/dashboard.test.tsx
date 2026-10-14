import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import type { StatusDto } from '../../src/shared/api-types';

function mockApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const body = routes[path];
      return body === undefined ? new Response('{}', { status: 404 }) : Response.json(body);
    }),
  );
}

const status = (mailgunDomain: StatusDto['mailgunDomain']): StatusDto => ({
  mailgunDomain,
  nextScheduled: { id: 3, subject: 'December alerts', scheduledAt: '2026-12-01T09:00:00.000Z' },
  lastSent: { id: 2, subject: 'November alerts', sentAt: '2026-11-02T09:00:00.000Z', stats: { sent: 182, delivered: 180, opened: 90, bounced: 2, complained: 0, unsubscribed: 1, problems: [] } },
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

afterEach(() => vi.unstubAllGlobals());

describe('dashboard', () => {
  it('warns that sending is off when Mailgun has not verified the domain', async () => {
    mockApi({ '/api/status': status('unverified') });
    renderAt('/');
    expect(await screen.findByText('Mailgun hasn’t verified news.enhancedgroup.co.uk yet — sending is switched off')).toBeInTheDocument();
  });

  it('explains the sending-only key case', async () => {
    mockApi({ '/api/status': status('unknown') });
    renderAt('/');
    expect(await screen.findByText(/can’t check the domain automatically/)).toBeInTheDocument();
  });

  it('shows the next scheduled email and the last send', async () => {
    mockApi({ '/api/status': status('verified') });
    renderAt('/');
    expect(await screen.findByText('December alerts')).toBeInTheDocument();
    expect(screen.getByText('November alerts')).toBeInTheDocument();
    expect(screen.getByText('182')).toBeInTheDocument();
  });

  it('shows the session banner when the API says the session expired', async () => {
    mockApi({ '/api/status': status('verified') });
    renderAt('/');
    await screen.findByText('December alerts');
    act(() => {
      window.dispatchEvent(new Event('tsn:session-expired'));
    });
    expect(screen.getByText('Your session expired — reload to sign in')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('has navigation to every section', () => {
    mockApi({ '/api/status': status('verified') });
    renderAt('/');
    for (const name of ['Dashboard', 'Emails', 'Card library', 'Lists', 'Suppressions', 'Settings']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });
});
