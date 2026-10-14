import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { mockApi } from './mockApi';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

afterEach(() => vi.unstubAllGlobals());

const csvFile = (text: string) => new File([text], 'clients.csv', { type: 'text/csv' });

describe('list import wizard', () => {
  it('shows the change summary for an existing list', async () => {
    mockApi({
      'GET /api/lists': { lists: [{ id: 4, name: 'Clients', description: '', memberCount: 4, updatedAt: '2026-11-01T00:00:00.000Z' }] },
      'POST /api/lists/import/preview': {
        parse: { rows: [], invalid: [{ line: 7, value: 'not-an-email' }], duplicatesInFile: 0, columns: ['Email'], mapping: { email: 'Email' } },
        diff: { added: ['a@x.com', 'b@x.com'], removed: ['c@x.com'], unchanged: 3, suppressed: [] },
      },
    });
    renderAt('/lists/4/import');
    await userEvent.upload(await screen.findByLabelText('CSV file'), csvFile('Email\na@x.com\n'));
    expect(await screen.findByText('+2 new, −1 not in file, 3 unchanged, 1 invalid, 0 suppressed')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove people not in this file')).toBeChecked();
    expect(screen.getByText('Line 7: not-an-email')).toBeInTheDocument();
  });

  it('asks which columns to use when it can’t find an email column', async () => {
    mockApi({
      'GET /api/lists': { lists: [] },
      'POST /api/lists/import/preview': {
        parse: { rows: [], invalid: [], duplicatesInFile: 0, columns: ['Who', 'Address'], mapping: null },
        diff: { added: [], removed: [], unchanged: 0, suppressed: [] },
      },
    });
    renderAt('/lists/import');
    await userEvent.type(await screen.findByLabelText('List name'), 'New clients');
    await userEvent.upload(screen.getByLabelText('CSV file'), csvFile('Who,Address\nAnn,a@x.com\n'));
    const select = await screen.findByLabelText('Email column');
    expect(select).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Address' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove people not in this file')).not.toBeInTheDocument();
  });

  it('saves a new list and goes to its members', async () => {
    const calls = mockApi({
      'GET /api/lists': { lists: [] },
      'POST /api/lists/import/preview': {
        parse: { rows: [{ email: 'a@x.com', name: 'A' }], invalid: [], duplicatesInFile: 0, columns: ['Email'], mapping: { email: 'Email' } },
        diff: { added: ['a@x.com'], removed: [], unchanged: 0, suppressed: [] },
      },
      'POST /api/lists/import/commit': { listId: 9, diff: { added: ['a@x.com'], removed: [], unchanged: 0, suppressed: [] } },
      'GET /api/lists/9/members': { members: [{ email: 'a@x.com', name: 'A', suppressed: false }] },
    });
    renderAt('/lists/import');
    await userEvent.type(await screen.findByLabelText('List name'), 'New clients');
    await userEvent.upload(screen.getByLabelText('CSV file'), csvFile('Email\na@x.com\n'));
    await userEvent.click(await screen.findByRole('button', { name: 'Save list' }));
    expect(await screen.findByText('a@x.com')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/lists/import/commit')?.body).toMatchObject({ name: 'New clients', removeMissing: true });
  });
});
