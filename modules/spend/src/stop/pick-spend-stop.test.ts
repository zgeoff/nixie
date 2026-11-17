import { expect, test } from 'bun:test';
import {
  buildMockGatewayStatus,
  buildMockPeriodStatus,
  buildSpendFacts,
  buildTrippedStop,
} from '../test-utils';
import { pickSpendStop } from './pick-spend-stop';

test('it reports an unreachable gateway', () => {
  expect(pickSpendStop(buildSpendFacts({ status: null }))).toStrictEqual({ state: 'unreachable' });
});

test('it reports the lost mark', () => {
  const status = buildMockGatewayStatus({ lost: true });

  expect(pickSpendStop(buildSpendFacts({ status }))).toStrictEqual({ state: 'lost' });
});

test('it reports the lost trip of the gateway as the lost mark', () => {
  const status = buildMockGatewayStatus({ tripped: { lost: true, at: '2026-11-13T16:00:00Z' } });

  expect(pickSpendStop(buildSpendFacts({ status }))).toStrictEqual({ state: 'lost' });
});

test('it is clear under every limit', () => {
  const facts = buildSpendFacts({ turns: { day: 999, month: 19_999 } });

  expect(pickSpendStop(facts)).toStrictEqual({ state: 'clear' });
});

test('it reports a day trip by dollars from the gateway, which a raise can lift', () => {
  const status = buildMockGatewayStatus({
    periods: {
      day: buildMockPeriodStatus({ spent: { dollars: 61.2, tokens: 51_200_000 } }),
      month: buildMockPeriodStatus({ start: '2026-11-01' }),
    },
    tripped: { period: 'day', measure: 'dollars', at: '2026-11-13T16:42:07Z' },
  });

  const stop = pickSpendStop(buildSpendFacts({ status, turns: { day: 40, month: 400 } }));

  expect(stop).toStrictEqual(buildTrippedStop());
});

test('it cannot raise a day trip whose dollar limit is at its cap', () => {
  const status = buildMockGatewayStatus({
    periods: {
      day: buildMockPeriodStatus({
        spent: { dollars: 120, tokens: 0 },
        limit: { dollars: 120, tokens: 80_000_000 },
      }),
      month: buildMockPeriodStatus({ start: '2026-11-01' }),
    },
    tripped: { period: 'day', measure: 'dollars', at: '2026-11-13T16:42:07Z' },
  });

  expect(pickSpendStop(buildSpendFacts({ status }))).toMatchObject({
    state: 'tripped',
    canRaise: false,
  });
});

test('it cannot raise a day trip when another tripped measure is at its cap', () => {
  const status = buildMockGatewayStatus({
    periods: {
      day: buildMockPeriodStatus({
        spent: { dollars: 61, tokens: 160_000_000 },
        limit: { dollars: 60, tokens: 160_000_000 },
      }),
      month: buildMockPeriodStatus({ start: '2026-11-01' }),
    },
    tripped: { period: 'day', measure: 'dollars', at: '2026-11-13T16:42:07Z' },
  });

  expect(pickSpendStop(buildSpendFacts({ status }))).toMatchObject({
    state: 'tripped',
    canRaise: false,
  });
});

test('it never offers a raise for a month trip', () => {
  const status = buildMockGatewayStatus({
    periods: {
      day: buildMockPeriodStatus(),
      month: buildMockPeriodStatus({
        start: '2026-11-01',
        resetsAt: '2026-12-01T00:00:00Z',
        spent: { dollars: 600, tokens: 0 },
        limit: { dollars: 600, tokens: 600_000_000 },
        cap: { dollars: 1200, tokens: 1_200_000_000 },
      }),
    },
    tripped: { period: 'month', measure: 'dollars', at: '2026-11-13T16:42:07Z' },
  });

  expect(pickSpendStop(buildSpendFacts({ status }))).toMatchObject({
    state: 'tripped',
    period: 'month',
    resetsAt: Date.parse('2026-12-01T00:00:00Z'),
    canRaise: false,
  });
});

test.each([
  { name: 'at the day limit', turns: { day: 1000, month: 1000 }, period: 'day', limit: 1000 },
  { name: 'at the month limit', turns: { day: 10, month: 20_000 }, period: 'month', limit: 20_000 },
])('it trips by turns $name', (row) => {
  const stop = pickSpendStop(buildSpendFacts({ turns: row.turns }));

  expect(stop).toMatchObject({
    state: 'tripped',
    period: row.period,
    measure: 'turns',
    limit: row.limit,
    at: Date.parse('2026-11-13T16:42:07Z'),
  });
});

test('it lifts the day turn limit to the raise', () => {
  const raise = { dollars: 60, tokens: 80_000_000, by: 'host', turns: 1500 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 }, raise })),
  ).toStrictEqual({ state: 'clear' });
});

test('it trips again at the raised day turn limit', () => {
  const raise = { dollars: 60, tokens: 80_000_000, by: 'host', turns: 1500 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 1500, month: 1500 }, raise })),
  ).toMatchObject({ state: 'tripped', measure: 'turns', limit: 1500 });
});

test('it keeps the config turn limit when a raise holds fewer turns', () => {
  const raise = { dollars: 60, tokens: 80_000_000, by: 'host', turns: 500 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 }, raise })),
  ).toMatchObject({ state: 'tripped', measure: 'turns', limit: 1000 });
});

test('it lets a turn raise above the cap stand', () => {
  const raise = { dollars: 60, tokens: 80_000_000, by: 'host', turns: 3000 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 2500, month: 2500 }, raise })),
  ).toStrictEqual({ state: 'clear' });
});

test('it can raise a day turn trip below the turn cap', () => {
  const stop = pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 } }));

  expect(stop).toMatchObject({ state: 'tripped', canRaise: true });
});

test('it cannot raise a day turn trip at the turn cap', () => {
  const raise = { dollars: 60, tokens: 80_000_000, by: 'host', turns: 2000 };
  const stop = pickSpendStop(buildSpendFacts({ turns: { day: 2000, month: 2000 }, raise }));

  expect(stop).toMatchObject({ state: 'tripped', canRaise: false });
});
