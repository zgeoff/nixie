import { expect, test } from 'bun:test';
import { collectStatusEvents } from './collect-status-events';
import type { StatusStep } from './collect-status-events';

function setupTest() {
  const who = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
  };

  return {
    who,
    buildStep: (sequence: number, step: StatusStep['step']): StatusStep => ({
      sequence,
      atMs: sequence * 1000,
      connection: 'conn-1',
      step,
    }),
    collect: (steps: readonly StatusStep[], calls: readonly number[], range: [number, number]) =>
      collectStatusEvents(
        {
          steps,
          failedCalls: calls.map((sequence) => ({ sequence, connection: 'conn-1' })),
          identities: new Map([['conn-1', who]]),
        },
        { after: range[0], through: range[1] },
      ),
  };
}

test('it makes an event of each change into failing, and gives the reason', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: 'no_answer' })],
    [],
    [0, 9],
  );

  expect(events).toStrictEqual([
    {
      sequence: 5,
      atMs: 5000,
      who: ctx.who,
      kind: 'changed',
      status: 'failing',
      reason: 'no_answer',
    },
  ]);
});

test('it makes an event of each change into needs consent and into expiring', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'expiring' }), ctx.buildStep(6, { kind: 'needs_consent' })],
    [],
    [0, 9],
  );

  expect(
    events.map((event) => [event.kind, event.kind === 'changed' ? event.status : null]),
  ).toStrictEqual([
    ['changed', 'expiring'],
    ['changed', 'needs_consent'],
  ]);
});

test('it makes an event of the return to active with the calls that failed during the break', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: null }), ctx.buildStep(20, { kind: 'active' })],
    [3, 7, 9],
    [10, 30],
  );

  expect(events).toStrictEqual([
    { sequence: 20, atMs: 20_000, who: ctx.who, kind: 'returned', failedCalls: 2 },
  ]);
});

test('it counts a call of the break that noted its failure after the answer that ended it', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: null }), ctx.buildStep(20, { kind: 'active' })],
    [7, 21],
    [10, 30],
  );

  expect(events).toStrictEqual([
    { sequence: 20, atMs: 20_000, who: ctx.who, kind: 'returned', failedCalls: 2 },
  ]);
});

test('it leaves a call of a later break out of the count of the earlier one', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(5, { kind: 'failing', reason: null }),
      ctx.buildStep(20, { kind: 'active' }),
      ctx.buildStep(25, { kind: 'failing', reason: null }),
    ],
    [7, 26],
    [10, 30],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([1, null]);
});

test('it counts the calls of the whole break when the break moved from failing to needs consent', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(5, { kind: 'failing', reason: null }),
      ctx.buildStep(8, { kind: 'needs_consent' }),
      ctx.buildStep(20, { kind: 'active' }),
    ],
    [6, 9],
    [10, 30],
  );

  expect(events).toStrictEqual([
    { sequence: 20, atMs: 20_000, who: ctx.who, kind: 'returned', failedCalls: 2 },
  ]);
});

test('it makes no event of an active status that no break came before', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(5, { kind: 'active' })], [], [0, 9]);

  expect(events).toStrictEqual([]);
});

test('it makes an event of a break that passed the notice time', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(40, { kind: 'lasted', sinceMs: 1234 })], [], [30, 50]);

  expect(events).toStrictEqual([
    { sequence: 40, atMs: 40_000, who: ctx.who, kind: 'lasted', sinceMs: 1234 },
  ]);
});

test('it leaves out an event outside the range', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(5, { kind: 'failing', reason: null })], [], [5, 9]);

  expect(events).toStrictEqual([]);
});

test('it leaves out the events of a connection that no longer lives', () => {
  const ctx = setupTest();

  const events = collectStatusEvents(
    {
      steps: [ctx.buildStep(5, { kind: 'failing', reason: null })],
      failedCalls: [],
      identities: new Map(),
    },
    { after: 0, through: 9 },
  );

  expect(events).toStrictEqual([]);
  expect(ctx.who.label).toBe('Work');
});
