import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { spendStore } from '../mocks/spend-store';
import { buildMockSpendTrip } from '../test-utils/build-mock-spend-trip';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { SpendStopNotice } from './spend-stop-notice';

function setupTest() {
  return { user: userEvent.setup() };
}

test('it shows nothing while spending is clear', async () => {
  await createDeviceSession();

  const rendered = render(<SpendStopNotice />);

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});

test('it tells the owner that a day limit stopped spending', async () => {
  await createDeviceSession();

  await spendStore.stops.create({ stop: buildMockSpendTrip() });

  const rendered = render(<SpendStopNotice />);

  const notice = await rendered.findByRole('region', { name: 'model spending is stopped' });

  expect(notice).toHaveTextContent(/the daily limit of \$60 was reached/u);
});

test('it offers no raise to an operator-only stop', async () => {
  await createDeviceSession();

  await spendStore.stops.create({ stop: { state: 'unreachable' } });

  const rendered = render(<SpendStopNotice />);

  await rendered.findByText(/cannot reach the spending gateway/u);

  expect(rendered.queryByRole('button', { name: /Raise/u })).toBeNull();
});

test('it raises the limit with one confirm and clears the notice', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({ stop: buildMockSpendTrip() });

  const rendered = render(<SpendStopNotice />);

  const open = await rendered.findByRole('button', { name: "Raise today's limit" });

  await ctx.user.click(open);
  await ctx.user.click(rendered.getByRole('button', { name: 'Confirm raise' }));

  await waitFor(() => {
    expect(spendStore.raises.all()).toMatchObject([
      { start: '2026-11-13', dollars: 90, tokens: 80_000_000, turns: 1000 },
    ]);
  });

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});
