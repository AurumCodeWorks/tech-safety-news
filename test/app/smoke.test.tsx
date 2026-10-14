import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from '../../src/app/App';

it('renders the app shell heading', () => {
  render(<App />);
  expect(screen.getByText('Tech Safety News')).toBeInTheDocument();
});
