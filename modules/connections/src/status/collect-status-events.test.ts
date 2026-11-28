import { expect, test } from 'bun:test';
import { collectStatusEvents } from './collect-status-events';
import type { StatusStep } from './collect-status-events';

// the times a call began and a job run started, in ms
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
    buildStep: (sequence: number, step: StatusStep['step'], atMs?: number): StatusStep => ({
      sequence,
      atMs: atMs ?? sequence * 1000,
      connection: 'conn-1',
      step,
    }),
    collect: (steps: readonly StatusStep[], notes: BreakNotes, range: [number, number]) =>
      collectStatusEvents(
        {
          steps,
          failedCalls: (notes.calls ?? []).map((atMs) => ({ atMs, connection: 'conn-1' })),
          skippedRuns: (notes.runs ?? []).map((atMs) => ({ atMs, connection: 'conn-1' })),
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

test('it makes an event of each change into expiring', () => {
  const ctx = setupTest();
  const events = ctx.collect([ctx.buildStep(5, { kind: 'expiring' })], {}, [0, 9]);

  expect(
    events.map((event) => [event.kind, event.kind === 'changed' ? event.status : null]),
  ).toStrictEqual([['changed', 'expiring']]);
});

test('it makes an event of the return to active with the calls that failed and the job runs that ran without it', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: null }), ctx.buildStep(20, { kind: 'active' })],
    { calls: [3000, 7000, 9000], runs: [4000, 8000, 12_000] },
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
    { calls: [7000] },
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

test('it counts a call that began in the break, though its note landed after the break ended', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(5, { kind: 'failing', reason: null }), ctx.buildStep(20, { kind: 'active' })],
    { calls: [7000, 19_000] },
    [10, 30],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([2]);
});

test('it counts a call of the first break by the time it began, though its note landed in the second break', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(5, { kind: 'failing', reason: null }),
      ctx.buildStep(20, { kind: 'active' }),
      ctx.buildStep(35, { kind: 'failing', reason: null }),
      ctx.buildStep(50, { kind: 'active' }),
    ],
    { calls: [19_000, 40_000] },
    [10, 60],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([1, null, 1]);
});

test('it counts a call that failed after the grant ended but before the sweep recorded it', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(25, { kind: 'needs_consent' }, 10_000),
      ctx.buildStep(30, { kind: 'active' }, 40_000),
    ],
    { calls: [12_000] },
    [10, 40],
  );

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([null, 1]);
});

test('it makes an event of the return of a connection renewed while it expired, before any record of the expiry', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [ctx.buildStep(20, { kind: 'active', wasAttending: true })],
    {},
    [10, 30],
  );

  expect(events.map((event) => event.kind)).toStrictEqual(['returned']);
});

test('it counts the calls of the whole break when the break moved from failing to needs consent', () => {
  const ctx = setupTest();

  const events = ctx.collect(
    [
      ctx.buildStep(5, { kind: 'failing', reason: null }),
      ctx.buildStep(8, { kind: 'needs_consent' }),
      ctx.buildStep(20, { kind: 'active' }),
    ],
    { calls: [6000, 9000] },
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
