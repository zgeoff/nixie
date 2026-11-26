import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockGatewayStatus, buildSpendFacts, buildTrippedStop } from '../test-utils';
import { pickSpendStop } from './pick-spend-stop';

test('it reports an unreachable gateway', () => {
  expect(pickSpendStop(buildSpendFacts({ status: null }))).toStrictEqual({ state: 'unreachable' });
});

test('it reports the lost mark', () => {
  const status = buildMockGatewayStatus({ lost: true });

  expect(pickSpendStop(buildSpendFacts({ status }))).toStrictEqual({ state: 'lost' });
});

test('it is clear under every limit', () => {
  const facts = buildSpendFacts({ turns: { day: 999, month: 19_999 } });

  expect(pickSpendStop(facts)).toStrictEqual({ state: 'clear' });
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
  const raise = { by: 'host', turns: 1500 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 }, raise })),
  ).toStrictEqual({ state: 'clear' });
});

test('it trips again at the raised day turn limit', () => {
  const raise = { by: 'host', turns: 1500 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 1500, month: 1500 }, raise })),
  ).toMatchObject({ state: 'tripped', measure: 'turns', limit: 1500 });
});

test('it keeps the config turn limit when a raise holds fewer turns', () => {
  const raise = { by: 'host', turns: 500 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 }, raise })),
  ).toMatchObject({ state: 'tripped', measure: 'turns', limit: 1000 });
});

test('it lets a turn raise above the cap stand', () => {
  const raise = { by: 'host', turns: 3000 };

  expect(
    pickSpendStop(buildSpendFacts({ turns: { day: 2500, month: 2500 }, raise })),
  ).toStrictEqual({ state: 'clear' });
});

test('it can raise a day turn trip below the turn cap', () => {
  const stop = pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 } }));

  expect(stop).toMatchObject({ state: 'tripped', canRaise: true });
});

test('it cannot raise a day turn trip at the turn cap', () => {
  const raise = { by: 'host', turns: 2000 };
  const stop = pickSpendStop(buildSpendFacts({ turns: { day: 2000, month: 2000 }, raise }));

  expect(stop).toMatchObject({ state: 'tripped', canRaise: false });
});

test('it reports a day trip by turns, which a raise can lift', () => {
  const stop = pickSpendStop(buildSpendFacts({ turns: { day: 1000, month: 1000 } }));

  expect(stop).toStrictEqual(buildTrippedStop());
});

test('it leaves a route at its dollar limit out of the stop, because only that route waits', () => {
  const status = buildMockGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  const tripped = buildMockGatewayStatus({
    routes: { ...status.routes, plan: { ...plan, day: { ...plan.day, tripped: true } } },
  });

  expect(pickSpendStop(buildSpendFacts({ status: tripped }))).toStrictEqual({ state: 'clear' });
});
