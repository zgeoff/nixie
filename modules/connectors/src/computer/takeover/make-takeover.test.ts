import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { WatchConnection } from '../watch/types';
import { makeTakeover } from './make-takeover';
import type { HandBackRead, TakeoverEndedRecord } from './types';

interface SetupOptions {
  // the calls already running finish only when the test says so
  readonly isWaitingOnCalls?: boolean;
  readonly isDrained?: boolean;
}

function setupTest(options: SetupOptions = {}) {
  const clock = createFakeClock({ startMs: 1_000_000 });
  const started: string[] = [];
  const ended: TakeoverEndedRecord[] = [];
  const calls = Promise.withResolvers<boolean>();
  const releases = { count: 0, closes: 0 };
  const awake = { holds: 0, releases: 0 };

  const read: HandBackRead = {
    origins: ['https://itch.io'],
    now: { kind: 'browser', tab: 'g1', text: 'Solve the puzzle' },
  };

  const takeover = makeTakeover({
    clock,
    logger: () => {},
    idleMs: 30 * 60 * 1000,
    records: {
      writeStarted: (input) => {
        started.push(input.device);

        return Promise.resolve();
      },
      writeEnded: (input) => {
        ended.push(input);

        return Promise.resolve();
      },
    },
    waitForCalls: () =>
      options.isWaitingOnCalls === true
        ? calls.promise
        : Promise.resolve(options.isDrained !== false),
    keepAwake: () => {
      awake.holds += 1;

      return () => {
        awake.releases += 1;
      };
    },
    begin: () => Promise.resolve(),
    finish: () => Promise.resolve(read),
  });

  const watch: WatchConnection = {
    receive: () => {},
    end: () => {},
    releaseInput: () => {
      releases.count += 1;
    },
    closeAfterRelease: () => {
      releases.closes += 1;
    },
  };

  return {
    clock,
    takeover,
    started,
    ended,
    read,
    releases,
    awake,
    watch,
    finishCalls: (isDrained: boolean) => {
      calls.resolve(isDrained);
    },
  };
}

test('it starts a hold for a device and writes the start record', async () => {
  const ctx = setupTest();

  const result = await ctx.takeover.start('laptop');

  expect(result).toStrictEqual({ kind: 'started', takenOverAt: 1_000_000 });

  expect([ctx.started, ctx.takeover.isHeld(), ctx.takeover.isHolder('laptop')]).toStrictEqual([
    ['laptop'],
    true,
    true,
  ]);
});

test('it answers a second take-over from the same device with the same start', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  ctx.clock.advance(5000);

  const result = await ctx.takeover.start('laptop');

  expect([result, ctx.started]).toStrictEqual([
    { kind: 'started', takenOverAt: 1_000_000 },
    ['laptop'],
  ]);
});

test('it answers a take-over from a second device with held elsewhere', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  const result = await ctx.takeover.start('phone');

  expect([result, ctx.takeover.isHolder('phone'), ctx.takeover.isHolder('laptop')]).toStrictEqual([
    { kind: 'held_elsewhere' },
    false,
    true,
  ]);
});

test('it counts the desktop as held from the call of the take-over, while it waits for running calls', async () => {
  const ctx = setupTest({ isWaitingOnCalls: true });
  const starting = ctx.takeover.start('laptop');
  const beforeHolder = [ctx.takeover.isHeld(), ctx.takeover.isHolder('laptop')];

  ctx.finishCalls(true);

  await starting;

  expect([beforeHolder, ctx.takeover.isHolder('laptop')]).toStrictEqual([[true, false], true]);
});

test('it answers a second device that calls while the first waits with held elsewhere', async () => {
  const ctx = setupTest({ isWaitingOnCalls: true });
  const first = ctx.takeover.start('laptop');

  const second = await ctx.takeover.start('phone');

  ctx.finishCalls(true);

  await first;

  expect(second).toStrictEqual({ kind: 'held_elsewhere' });
});

test('it gives up with busy too long when the running calls pass their limit, and holds nothing', async () => {
  const ctx = setupTest({ isDrained: false });

  const result = await ctx.takeover.start('laptop');

  expect([result, ctx.takeover.isHeld(), ctx.started]).toStrictEqual([
    { kind: 'busy_too_long' },
    false,
    [],
  ]);
});

test('it ends a hold for its device, writes what the guest saw and drops the input of its watches', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  ctx.takeover.addWatch('laptop', ctx.watch);
  ctx.clock.advance(63_000);

  const result = await ctx.takeover.end('user', 'laptop');

  expect([result, ctx.ended, ctx.releases.count, ctx.takeover.isHeld()]).toStrictEqual([
    { kind: 'ended', durationSeconds: 63 },
    [{ by: 'user', durationSeconds: 63, read: ctx.read }],
    1,
    false,
  ]);
});

test('it closes the streams of every tab of the holder device when one tab hands back', async () => {
  const ctx = setupTest();
  const closed: string[] = [];

  const buildTab = (name: string): WatchConnection => ({
    ...ctx.watch,
    closeAfterRelease: () => {
      closed.push(name);
    },
  });

  await ctx.takeover.start('laptop');

  ctx.takeover.addWatch('laptop', buildTab('first tab'));
  ctx.takeover.addWatch('laptop', buildTab('second tab'));
  ctx.takeover.addWatch('phone', buildTab('phone'));

  await ctx.takeover.end('user', 'laptop');

  expect(closed).toStrictEqual(['first tab', 'second tab']);
});

test('it keeps the hold when another device hands back', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  const result = await ctx.takeover.end('user', 'phone');

  expect([result, ctx.takeover.isHeld(), ctx.ended]).toStrictEqual([
    { kind: 'not_taken_over' },
    true,
    [],
  ]);
});

test('it answers a hand-back with no hold as not taken over', async () => {
  const ctx = setupTest();

  const result = await ctx.takeover.end('user', 'laptop');

  expect(result).toStrictEqual({ kind: 'not_taken_over' });
});

test('it raises the epoch when a hold starts and again when it ends', async () => {
  const ctx = setupTest();
  const epochs = [ctx.takeover.epoch()];

  await ctx.takeover.start('laptop');

  epochs.push(ctx.takeover.epoch());

  await ctx.takeover.end('user', 'laptop');

  epochs.push(ctx.takeover.epoch());

  expect(epochs).toStrictEqual([0, 1, 2]);
});

test('it ends a hold with idle once its device sends no input for the idle time', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.ended.length === 1);

  expect([ctx.ended[0]?.by, ctx.ended[0]?.durationSeconds, ctx.takeover.isHeld()]).toStrictEqual([
    'idle',
    1800,
    false,
  ]);
});

test('it holds off the idle hand-back while the device sends input', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  ctx.clock.advance(20 * 60 * 1000);
  ctx.takeover.touch('laptop');
  ctx.clock.advance(20 * 60 * 1000);

  expect([ctx.ended, ctx.takeover.isHeld()]).toStrictEqual([[], true]);
});

test('it writes an end by restart with nothing read from the guest', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  ctx.clock.advance(10_000);

  await ctx.takeover.end('restart');

  expect(ctx.ended).toStrictEqual([{ by: 'restart', durationSeconds: 10, read: null }]);
});

test('it keeps the sandbox awake from the start of a hold to its end', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  const whileHeld = { ...ctx.awake };

  await ctx.takeover.end('user', 'laptop');

  expect([whileHeld, ctx.awake]).toStrictEqual([
    { holds: 1, releases: 0 },
    { holds: 1, releases: 1 },
  ]);
});

test('it ends an idle hold named for its holder, so the assistant is admitted again', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  const result = await ctx.takeover.end('idle', 'laptop');

  expect([result.kind, ctx.takeover.isHeld(), ctx.ended.map((record) => record.by)]).toStrictEqual([
    'ended',
    false,
    ['idle'],
  ]);
});

test('it leaves a hold alone when an end names another device', async () => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  const result = await ctx.takeover.end('idle', 'phone');

  expect([result.kind, ctx.takeover.isHeld()]).toStrictEqual(['not_taken_over', true]);
});

test.each([
  { by: 'idle' as const, closes: 1 },
  { by: 'restart' as const, closes: 1 },
  { by: 'user' as const, closes: 1 },
])('it closes the holder watches after a $by end $closes times', async (row) => {
  const ctx = setupTest();

  await ctx.takeover.start('laptop');

  ctx.takeover.addWatch('laptop', ctx.watch);

  await ctx.takeover.end(row.by, 'laptop');

  expect(ctx.releases.closes).toBe(row.closes);
});
