import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { mockApi } from './mockApi';

afterEach(() => vi.unstubAllGlobals());

const rows = [
  { email: 'gone@x.com', reason: 'unsubscribed', createdAt: '2026-11-01T00:00:00.000Z', campaignId: 1, note: null },
  { email: 'bounce@x.com', reason: 'bounced', createdAt: '2026-11-01T00:00:00.000Z', campaignId: 1, note: null },
];

describe('suppressions page', () => {
  it('only offers Remove for bounced and manual entries', async () => {
    mockApi({ 'GET /api/suppressions': { suppressions: rows } });
    render(
      <MemoryRouter initialEntries={['/suppressions']}>
        <App />
      </MemoryRouter>,
    );
    const gone = (await screen.findByText('gone@x.com')).closest('tr')!;
    const bounce = screen.getByText('bounce@x.com').closest('tr')!;
    expect(within(gone).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(within(bounce).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('requires a note before removing', async () => {
    const calls = mockApi({ 'GET /api/suppressions': { suppressions: rows }, 'DELETE /api/suppressions/bounce%40x.com': null });
    render(
      <MemoryRouter initialEntries={['/suppressions']}>
        <App />
      </MemoryRouter>,
    );
    const bounce = (await screen.findByText('bounce@x.com')).closest('tr')!;
    await userEvent.click(within(bounce).getByRole('button', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    expect(screen.getByText('Add a note saying why this address can be emailed again')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note'), 'New mailbox confirmed by phone');
    await userEvent.click(screen.getByRole('button', { name: 'Remove from list' }));
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ note: 'New mailbox confirmed by phone' });
  });
});
