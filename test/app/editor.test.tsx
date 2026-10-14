import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '../../src/app/pages/Editor';
import type { CampaignDto } from '../../src/shared/api-types';
import { mockApi } from './mockApi';

const draft: CampaignDto = {
  id: 5,
  subject: 'November alerts',
  preheader: '',
  blocks: [],
  status: 'draft',
  listIds: [],
  scheduledAt: null,
  sentAt: null,
  testSentAt: null,
  hideFromArchive: false,
  slug: null,
  updatedAt: '2026-11-01T00:00:00.000Z',
  lastError: null,
};

function setup(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/campaigns/5': draft,
    'PUT /api/campaigns/5': (body: unknown) => ({ ...draft, ...(body as object) }),
    'POST /api/preview': { html: '<p>preview</p>', text: 'preview' },
    'GET /api/cards': { cards: [] },
    ...extra,
  });
}

const renderEditor = () =>
  render(
    <MemoryRouter initialEntries={['/emails/5']}>
      <Routes>
        <Route path="/emails/:id" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );

const blockOrder = () => screen.getAllByTestId('block-type').map((el) => el.textContent);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('editor', () => {
  beforeEach(() => setup());

  it('adds blocks and moves them up', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Add Scam alert' }));
    await user.click(screen.getByRole('button', { name: 'Add Tip' }));
    expect(blockOrder()).toEqual(['Scam alert', 'Tip of the month']);
    const tip = screen.getAllByTestId('block')[1];
    await user.click(within(tip).getByRole('button', { name: 'Move up' }));
    expect(blockOrder()).toEqual(['Tip of the month', 'Scam alert']);
  });

  it('shows validation messages for incomplete blocks', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Add Scam alert' }));
    expect(screen.getByText('Warning signs can’t be empty')).toBeInTheDocument();
    expect(screen.getAllByText('Add a title').length).toBeGreaterThan(0);
  });

  it('autosaves once after typing stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderEditor();
    const subject = await screen.findByLabelText('Subject');
    await user.clear(subject);
    await user.type(subject, 'December');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ subject: 'December' });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('saves a newly ticked list before re-checking, so Send becomes available', async () => {
    let savedLists: number[] = [];
    setup({
      'PUT /api/campaigns/5': (body: unknown) => {
        savedLists = (body as { listIds: number[] }).listIds;
        return { ...draft, ...(body as object) };
      },
      'GET /api/lists': { lists: [{ id: 1, name: 'Clients', description: '', memberCount: 3, updatedAt: '2026-11-01T00:00:00.000Z' }] },
      'POST /api/recipients/count': { count: 3, duplicatesRemoved: 0, suppressed: 0 },
      'GET /api/campaigns/5/preflight': () =>
        savedLists.includes(1) ? { ok: true, recipients: 3 } : { ok: false, reasons: ['Pick at least one list with people on it'] },
    });
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Send or schedule' }));
    await user.click(await screen.findByRole('checkbox', { name: /Clients/ }));
    expect(await screen.findByText('Ready to send')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send now' })).toBeEnabled();
  });

  it('shows character counters', async () => {
    renderEditor();
    expect(await screen.findByText('15 / 90')).toBeInTheDocument();
  });
});
