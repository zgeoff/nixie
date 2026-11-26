import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { spendStore } from '../mocks/spend-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { SpendCounts } from './spend-counts';

function setupTest() {
  return {
    buildCounts: (display: { currency: string; rate: number } | null) => ({
      providers: [],
      routes: [
        {
          route: 'plan',
          provider: 'main',
          day: { start: '2026-11-13', dollars: 12.4, limit: 40, tripped: false },
          month: { start: '2026-11-01', dollars: 211.9, limit: 600, tripped: false },
        },
        {
          route: 'metered',
          provider: 'main',
          day: { start: '2026-11-13', dollars: 5.02, limit: 5, tripped: true },
          month: { start: '2026-11-01', dollars: 5.02, limit: null, tripped: false },
        },
      ],
      display,
    }),
  };
}

test('it shows each route with its day and month counts in US dollars and approximate Australian dollars', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.counts.create({ counts: ctx.buildCounts({ currency: 'AUD', rate: 1.52 }) });

  const rendered = render(<SpendCounts />);

  await rendered.findByRole('heading', { name: 'plan' });

  const lines = rendered.getAllByText(/^(?:Today|This month):/u).map((line) => line.textContent);

  expect(lines).toStrictEqual([
    'Today: $12.40 (about A$19) of $40.00 (about A$61)',
    'This month: $211.90 (about A$322) of $600.00 (about A$912)',
    'Today: $5.02 (about A$7.63) of $5.00 (about A$7.60) (limit reached)',
    'This month: $5.02 (about A$7.63) no limit of its own',
  ]);
});

test('it shows US dollars alone while no rate has been read', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.counts.create({ counts: ctx.buildCounts(null) });

  const rendered = render(<SpendCounts />);

  await rendered.findByRole('heading', { name: 'plan' });

  const lines = rendered.getAllByText(/^(?:Today|This month):/u).map((line) => line.textContent);

  expect(lines.at(0)).toBe('Today: $12.40 of $40.00');
});

test('it says that no route counts spending when the gateway gives none', async () => {
  await createDeviceSession();

  const rendered = render(<SpendCounts />);

  await rendered.findByText('No model route counts spending here.');
});

test('it shows a provider with its count and the routes under it', async () => {
  await createDeviceSession();

  await spendStore.counts.create({
    counts: {
      providers: [
        {
          provider: 'main',
          day: { start: '2026-11-13', dollars: 30, limit: 100, tripped: false },
          month: { start: '2026-11-01', dollars: 300, limit: 1000, tripped: false },
        },
      ],
      routes: [
        {
          route: 'plan',
          provider: 'main',
          day: { start: '2026-11-13', dollars: 12.4, limit: null, tripped: false },
          month: { start: '2026-11-01', dollars: 211.9, limit: null, tripped: false },
        },
      ],
      display: null,
    },
  });

  const rendered = render(<SpendCounts />);

  const provider = await rendered.findByRole('article', { name: 'provider main' });

  expect(provider).toHaveTextContent('Today: $30.00 of $100.00');
  expect(provider).toHaveTextContent('plan');
  expect(provider).toHaveTextContent('Today: $12.40 no limit of its own');
});

test('it resets the count of a provider with one confirm, sending zero for the period', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await spendStore.counts.create({
    counts: {
      providers: [
        {
          provider: 'main',
          day: { start: '2026-11-13', dollars: 120, limit: 100, tripped: true },
          month: { start: '2026-11-01', dollars: 300, limit: 1000, tripped: false },
        },
      ],
      routes: [],
      display: null,
    },
  });

  const rendered = render(<SpendCounts />);

  const open = await rendered.findByRole('button', { name: 'Reset today for main' });

  await user.click(open);
  await user.click(rendered.getByRole('button', { name: 'Confirm reset today for main' }));

  await waitFor(() => {
    expect(spendStore.countSets.all()).toMatchObject([
      { provider: 'main', period: 'day', start: '2026-11-13', dollars: 0 },
    ]);
  });
});
