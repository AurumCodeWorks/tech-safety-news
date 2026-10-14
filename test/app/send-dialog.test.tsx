import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SendDialog } from '../../src/app/editor/SendDialog';
import type { CampaignDto } from '../../src/shared/api-types';
import { mockApi } from './mockApi';

const campaign = { id: 5, listIds: [1], status: 'draft' } as CampaignDto;
const lists = { lists: [{ id: 1, name: 'Clients', description: '', memberCount: 185, updatedAt: '2026-11-01T00:00:00.000Z' }] };
const count = { count: 182, duplicatesRemoved: 3, suppressed: 2 };

const props = () => ({ campaign, onListsChange: vi.fn(), flush: vi.fn(async () => {}), onClose: vi.fn(), onDone: vi.fn() });

afterEach(() => vi.unstubAllGlobals());

describe('send dialog', () => {
  it('lists what still needs doing and blocks sending', async () => {
    mockApi({
      'GET /api/lists': lists,
      'POST /api/recipients/count': count,
      'GET /api/campaigns/5/preflight': { ok: false, reasons: ['Send yourself a test after your latest changes'] },
    });
    render(<SendDialog {...props()} />);
    expect(await screen.findByText('Send yourself a test after your latest changes')).toBeInTheDocument();
    expect(screen.getByText('182 people · 3 duplicates removed · 2 suppressed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
  });

  it('asks for confirmation with the number of people', async () => {
    const calls = mockApi({
      'GET /api/lists': lists,
      'POST /api/recipients/count': count,
      'GET /api/campaigns/5/preflight': { ok: true, recipients: 182 },
      'POST /api/campaigns/5/send': { status: 'sent', accepted: 182, pending: 0 },
    });
    const p = props();
    render(<SendDialog {...p} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send now' }));
    expect(screen.getByText('Send to 182 people?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, send it' }));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/campaigns/5/send')).toBe(true);
    expect(p.onDone).toHaveBeenCalled();
  });

  it('sends a test to the signed-in user and re-checks', async () => {
    let tested = false;
    mockApi({
      'GET /api/lists': lists,
      'POST /api/recipients/count': count,
      'GET /api/campaigns/5/preflight': () => (tested ? { ok: true, recipients: 182 } : { ok: false, reasons: ['Send yourself a test after your latest changes'] }),
      'POST /api/campaigns/5/test': () => {
        tested = true;
        return null;
      },
    });
    render(<SendDialog {...props()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send test to me' }));
    expect(await screen.findByText('Test sent — check your inbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send now' })).toBeEnabled();
  });
});
