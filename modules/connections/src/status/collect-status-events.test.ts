import { expect, test } from 'bun:test';
import { collectStatusEvents } from './collect-status-events';
import type { StatusStep } from './collect-status-events';

interface BreakNotes {
  readonly calls?: readonly number[];
  readonly runs?: readonly number[];
}

function setupTest() {
  const who = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
  };

  const facts = { ...who, lastSuccessAtMs: 4000, toolNames: ['gmail.search', 'gmail.read'] };

  return {
    who,
    buildStep: (sequence: number, step: StatusStep['step']): StatusStep => ({
      sequence,
      atMs: sequence * 1000,
      connection: 'conn-1',
      step,
    }),
    collect: (steps: readonly StatusStep[], notes: BreakNotes, range: [number, number]) =>
      collectStatusEvents(
        {
          steps,
          failedCalls: (notes.calls ?? []).map((sequence) => ({ sequence, connection: 'conn-1' })),
          skippedRuns: (notes.runs ?? []).map((sequence) => ({ sequence, connection: 'conn-1' })),
          facts: new Map([['conn-1', facts]]),
        },
        { after: range[0], through: range[1] },
      ),
  };
}

test('it makes an event of each change into failing, and gives the reason, the last success and no removed tool', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: 'no_answer' })],
    {},
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
      lastSuccessAtMs: 4000,
      removedTools: [],
    },
  ]);
});

test('it names the tools that a change into needs consent removes', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(5, { kind: 'needs_consent' })], {}, [0, 9]);

  expect(
    events.map((event) => (event.kind === 'changed' ? event.removedTools : null)),
  ).toStrictEqual([['gmail.search', 'gmail.read']]);
});

test('it makes an event of each change into expiring and into disconnected', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'expiring' }), ctx.buildStep(6, { kind: 'disconnected' })],
    {},
    [0, 9],
  );

  expect(
    events.map((event) => [event.kind, event.kind === 'changed' ? event.status : null]),
  ).toStrictEqual([
    ['changed', 'expiring'],
    ['changed', 'disconnected'],
  ]);
});

test('it makes an event of the return to active with the calls that failed and the job runs that ran without it', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: null }), ctx.buildStep(20, { kind: 'active' })],
    { calls: [3, 7, 9], runs: [4, 8, 12] },
    [10, 30],
  );

  expect(events.at(-1)).toStrictEqual({
    sequence: 20,
    atMs: 20_000,
    who: ctx.who,
    kind: 'returned',
    failedCalls: 2,
    skippedRuns: 2,
  });
});

test('it makes an event of the return of a connection that only expired, with no failed call', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'expiring' }), ctx.buildStep(20, { kind: 'active' })],
    { calls: [7] },
    [10, 30],
  );

  expect(events).toStrictEqual([
    {
      sequence: 20,
      atMs: 20_000,
      who: ctx.who,
      kind: 'returned',
      failedCalls: 0,
      skippedRuns: 0,
    },
  ]);
});

test('it counts a call of the break that noted its failure after the answer that ended it', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: null }), ctx.buildStep(20, { kind: 'active' })],
    { calls: [7, 21] },
    [10, 30],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([2]);
});

test('it leaves a call of a later break out of the count of the earlier one, though the break is past the range', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(5, { kind: 'failing', reason: null }),
      ctx.buildStep(20, { kind: 'active' }),
      ctx.buildStep(35, { kind: 'failing', reason: null }),
    ],
    { calls: [7, 36] },
    [10, 30],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([1]);
});

test('it counts the calls of the whole break when the break moved from failing to needs consent', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(5, { kind: 'failing', reason: null }),
      ctx.buildStep(8, { kind: 'needs_consent' }),
      ctx.buildStep(20, { kind: 'active' }),
    ],
    { calls: [6, 9] },
    [10, 30],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([2]);
});

test('it makes no event of an active status that no break came before', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(5, { kind: 'active' })], {}, [0, 9]);

  expect(events).toStrictEqual([]);
});

test('it makes an event of a break that passed the notice time', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(40, { kind: 'lasted', sinceMs: 1234 })], {}, [30, 50]);

  expect(events).toStrictEqual([
    { sequence: 40, atMs: 40_000, who: ctx.who, kind: 'lasted', sinceMs: 1234 },
  ]);
});

test('it leaves out an event outside the range', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(5, { kind: 'failing', reason: null })], {}, [5, 9]);

  expect(events).toStrictEqual([]);
});

test('it leaves out the events of a connection that no longer lives', () => {
  const ctx = setupTest();

  const events = collectStatusEvents(
    {
      steps: [ctx.buildStep(5, { kind: 'failing', reason: null })],
      failedCalls: [],
      skippedRuns: [],
      facts: new Map(),
    },
    { after: 0, through: 9 },
  );

  expect(events).toStrictEqual([]);
});
