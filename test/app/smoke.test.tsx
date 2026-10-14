import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';

it('renders the app shell', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getAllByAltText('Enhanced Group Tech Safety News').length).toBeGreaterThan(0);
  vi.unstubAllGlobals();
});
