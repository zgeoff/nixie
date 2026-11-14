import { expect, test } from 'bun:test';
import { startTestTurnInputs } from '../test-utils';

async function setupTest(options: Parameters<typeof startTestTurnInputs>[0] = {}) {
  const ctx = await startTestTurnInputs(options);

  await ctx.turnInputs.runStart();

  return {
    ...ctx,
    writeInput: async (counter: number, size = 1) => {
      const capture = await ctx.turnInputs.openCapture({
        step: { taskID: 'task-a', stepRunID: `step-${String(counter)}@1` },
        profile: ctx.profile,
        role: 'task',
      });

      await ctx.writeSpoolFile(capture.baseURL, { counter, body: new Uint8Array(size).fill(7) });
      await capture.close({ callFrames: 1 });
    },
    readStates: async () => {
      const list = await ctx.turnInputs.list(20);

      return list.inputs
        .toSorted((first, second) => first.takenAt - second.takenAt)
        .map((input) => [input.counter, input.state, input.removedCause]);
    },
  };
}

test('it removes a request past retention.days', async () => {
  const ctx = await setupTest();

  await ctx.writeInput(1);

  ctx.clock.advance(6 * 86_400_000);

  await ctx.writeInput(2);

  ctx.clock.advance(2 * 86_400_000);

  await ctx.turnInputs.runSweep();

  const received1 = await ctx.readStates();

  expect(received1).toStrictEqual([
    [1, 'removed', 'retention_days'],
    [2, 'stored', null],
  ]);
});

test('it keeps a request inside retention.days', async () => {
  const ctx = await setupTest();

  await ctx.writeInput(1);

  ctx.clock.advance(6 * 86_400_000);

  await ctx.turnInputs.runSweep();

  const received2 = await ctx.readStates();

  expect(received2).toStrictEqual([[1, 'stored', null]]);
});

test('it drops the oldest request when a store passes retention.bytes', async () => {
  const ctx = await setupTest({ config: { retention: { days: 7, bytes: 100 } } });

  await ctx.writeInput(1, 60);

  ctx.clock.advance(1000);

  await ctx.writeInput(2, 60);

  const received3 = await ctx.readStates();

  expect(received3).toStrictEqual([
    [1, 'removed', 'retention_bytes'],
    [2, 'stored', null],
  ]);
});

test('it deletes a miss older than retention.days', async () => {
  const ctx = await setupTest();

  const capture = await ctx.turnInputs.openCapture({
    step: { taskID: 'task-a', stepRunID: 'step-1@1' },
    profile: ctx.profile,
    role: 'task',
  });

  await capture.close({ callFrames: 2 });

  ctx.clock.advance(8 * 86_400_000);

  await ctx.turnInputs.runSweep();

  const listed = await ctx.turnInputs.list(10);

  expect(listed.misses).toStrictEqual([]);
});

test('it sweeps a request while the log is off', async () => {
  const ctx = await setupTest();

  await ctx.writeInput(1);
  await ctx.turnInputs.set({ state: 'off', drop: false });

  ctx.clock.advance(8 * 86_400_000);

  await ctx.turnInputs.runSweep();

  const received4 = await ctx.readStates();

  expect(received4).toStrictEqual([[1, 'removed', 'retention_days']]);
});
