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
  return {
    user: userEvent.setup(),
    buildRouteTrip: (overrides: Record<string, unknown> = {}) => ({
      route: 'plan',
      period: 'day' as const,
      start: '2026-11-13',
      limit: 40,
      spent: 41.2,
      at: new Date('2026-11-13T16:42:07Z'),
      resetsAt: new Date('2026-11-14T00:00:00Z'),
      canRaise: true,
      cap: 80,
      ...overrides,
    }),
  };
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

test('it tells the owner which route waits at its limit, and offers a raise that names the route', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: { state: 'clear', routes: [ctx.buildRouteTrip()], providers: [] },
  });

  const rendered = render(<SpendStopNotice />);

  const notice = await rendered.findByRole('region', { name: 'model spending is stopped' });

  expect(notice).toHaveTextContent(/Model spending paused on plan/u);

  expect(
    rendered.getByRole('button', { name: 'Raise the day limit of route plan' }),
  ).toBeInTheDocument();
});

test('it shows the limit and the raise in US dollars with the approximate amount in the display currency', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.counts.create({
    counts: { providers: [], routes: [], display: { currency: 'AUD', rate: 1.5 } },
  });

  await spendStore.stops.create({
    stop: { state: 'clear', routes: [ctx.buildRouteTrip()], providers: [] },
  });

  const rendered = render(<SpendStopNotice />);

  await waitFor(() => {
    expect(rendered.getByRole('status')).toHaveTextContent(
      'its daily limit of $40.00 (about A$60) was reached',
    );
  });

  await ctx.user.click(rendered.getByRole('button', { name: 'Raise the day limit of route plan' }));

  expect(rendered.getByLabelText('US dollars')).toHaveValue(60);
  expect(rendered.getByText('$60.00 (about A$90)')).toBeInTheDocument();
});

test('it offers no raise for a route whose limit is at its cap or whose month is at its limit', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: {
      state: 'clear',
      providers: [],
      routes: [
        ctx.buildRouteTrip({ route: 'plan', canRaise: false }),
        ctx.buildRouteTrip({ route: 'metered', period: 'month', cap: null, canRaise: false }),
      ],
    },
  });

  const rendered = render(<SpendStopNotice />);

  await rendered.findByText(/Model spending paused on metered/u);

  expect(rendered.queryByRole('button', { name: /Raise/u })).toBeNull();
});

test('it raises the day limit of a route in dollars with one confirm and clears the notice', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: { state: 'clear', routes: [ctx.buildRouteTrip()], providers: [] },
  });

  const rendered = render(<SpendStopNotice />);

  const open = await rendered.findByRole('button', { name: 'Raise the day limit of route plan' });

  await ctx.user.click(open);
  await ctx.user.click(rendered.getByRole('button', { name: 'Confirm raise of route plan' }));

  await waitFor(() => {
    expect(spendStore.raises.all()).toMatchObject([
      { start: '2026-11-13', route: 'plan', dollars: 60 },
    ]);
  });

  await waitFor(() => {
    expect(rendered.container).toBeEmptyDOMElement();
  });
});

test('it says a raise is saved when the gateway gave no answer to it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: {
      state: 'clear',
      routes: [ctx.buildRouteTrip({ route: 'unanswered' })],
      providers: [],
    },
  });

  const rendered = render(<SpendStopNotice />);

  const open = await rendered.findByRole('button', {
    name: 'Raise the day limit of route unanswered',
  });

  await ctx.user.click(open);
  await ctx.user.click(rendered.getByRole('button', { name: 'Confirm raise of route unanswered' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('Your raise is saved, and applies when it answers.');
});

test('it says a raise is not saved when the gateway gave no status', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: {
      state: 'clear',
      routes: [ctx.buildRouteTrip({ route: 'no-status' })],
      providers: [],
    },
  });

  const rendered = render(<SpendStopNotice />);

  const open = await rendered.findByRole('button', {
    name: 'Raise the day limit of route no-status',
  });

  await ctx.user.click(open);
  await ctx.user.click(rendered.getByRole('button', { name: 'Confirm raise of route no-status' }));

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('your raise was not saved');
  expect(spendStore.raises.all()).toStrictEqual([]);
});

test('it offers no raise to an operator-only stop', async () => {
  await createDeviceSession();

  await spendStore.stops.create({ stop: { state: 'unreachable', routes: [], providers: [] } });

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

test('it tells the owner which provider waits at its limit and raises it with one confirm', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: {
      state: 'clear',
      routes: [],
      providers: [
        {
          provider: 'main',
          routes: ['plan', 'metered'],
          period: 'day',
          start: '2026-11-13',
          limit: 100,
          spent: 101.5,
          at: new Date('2026-11-13T16:42:07Z'),
          resetsAt: new Date('2026-11-14T00:00:00Z'),
          canRaise: true,
          cap: 200,
        },
      ],
    },
  });

  const rendered = render(<SpendStopNotice />);

  const notice = await rendered.findByRole('region', { name: 'model spending is stopped' });

  expect(notice).toHaveTextContent(/Model spending paused on the provider main/u);
  expect(notice).toHaveTextContent('plan, metered');

  await ctx.user.click(
    rendered.getByRole('button', { name: 'Raise the day limit of provider main' }),
  );

  expect(rendered.getByLabelText('US dollars')).toHaveValue(150);

  await ctx.user.click(rendered.getByRole('button', { name: 'Confirm raise of provider main' }));

  await waitFor(() => {
    expect(spendStore.raises.all()).toMatchObject([
      { start: '2026-11-13', provider: 'main', dollars: 150 },
    ]);
  });
});

test('it gives the raise button of a route and of a provider that share an ID names that differ', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await spendStore.stops.create({
    stop: {
      state: 'clear',
      routes: [ctx.buildRouteTrip({ route: 'main' })],
      providers: [
        {
          provider: 'main',
          routes: ['main'],
          period: 'day',
          start: '2026-11-13',
          limit: 100,
          spent: 101.5,
          at: new Date('2026-11-13T16:42:07Z'),
          resetsAt: new Date('2026-11-14T00:00:00Z'),
          canRaise: true,
          cap: 200,
        },
      ],
    },
  });

  const rendered = render(<SpendStopNotice />);

  await rendered.findByRole('button', { name: 'Raise the day limit of provider main' });

  expect(
    rendered
      .getAllByRole('button', { name: /^Raise the day limit of /u })
      .map((button) => button.textContent),
  ).toStrictEqual(['Raise the day limit of provider main', 'Raise the day limit of route main']);
});
