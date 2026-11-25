import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveConnection } from '../live/live-connection';
import { mockLive } from '../mocks/mock-live';
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

  expect(notice).toHaveTextContent(/the daily limit of 1,000 turns was reached/u);
});

test('it tells the owner which route waits at its limit, with no raise offered', async () => {
  await createDeviceSession();

  await spendStore.stops.create({
    stop: {
      state: 'clear',
      routes: [
        {
          route: 'plan',
          period: 'day',
          start: '2026-11-13',
          limit: 40,
          spent: 41.2,
          at: new Date('2026-11-13T16:42:07Z'),
          resetsAt: new Date('2026-11-14T00:00:00Z'),
          canRaise: true,
          cap: 80,
        },
      ],
    },
  });

  const rendered = render(<SpendStopNotice />);

  const notice = await rendered.findByRole('region', { name: 'model spending is stopped' });

  expect(notice).toHaveTextContent(/Model spending paused on plan/u);
  expect(rendered.queryByRole('button', { name: /Raise/u })).toBeNull();
});

test('it offers no raise to an operator-only stop', async () => {
  await createDeviceSession();

  await spendStore.stops.create({ stop: { state: 'unreachable', routes: [] } });

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
    expect(spendStore.raises.all()).toMatchObject([{ start: '2026-11-13', turns: 1500 }]);
  });

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});

test('it shows a stop that the watcher trips while the page is open, with no reload', async () => {
  await createDeviceSession();

  const rendered = render(
    <>
      <LiveConnection />
      <SpendStopNotice />
    </>,
  );

  await waitFor(() => {
    expect(mockLive.openCount).toBe(1);
  });

  await spendStore.stops.create({ stop: buildMockSpendTrip() });

  const notice = await rendered.findByRole('region', { name: 'model spending is stopped' });

  expect(notice).toHaveTextContent(/the daily limit of 1,000 turns was reached/u);
});
