import { expect, test } from 'bun:test';
import { createTurnInputs } from '../create-turn-inputs';
import { startTestTurnInputs } from '../test-utils';

async function setupTest(options: Parameters<typeof startTestTurnInputs>[0] = {}) {
  const ctx = await startTestTurnInputs(options);

  await ctx.turnInputs.runStart();

  return { ...ctx, restart: () => createTurnInputs(ctx.turnInputsOptions) };
}

test('it starts on with the always default', async () => {
  const ctx = await setupTest();
  const received1 = await ctx.turnInputs.readState();

  expect(received1).toStrictEqual({ state: 'on', until: null });
});

test('it holds off across a restart until an on record', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.set({ state: 'off', drop: false });

  const received2 = await ctx.restart().readState();

  expect(received2).toStrictEqual({ state: 'off', until: null });
});

test('it sets on until the end of a for', async () => {
  const ctx = await setupTest({ config: { default: 'off' } });
  const result = await ctx.turnInputs.set({ state: 'on', forMs: 60_000 });

  expect(result).toStrictEqual({ status: 'set', state: 'on', until: ctx.clock.now() + 60_000 });
});

test('it caps a for at max_window', async () => {
  const ctx = await setupTest({ config: { default: 'off', max_window: '1h' } });
  const result = await ctx.turnInputs.set({ state: 'on', forMs: 7 * 86_400_000 });

  expect(result).toStrictEqual({ status: 'set', state: 'on', until: ctx.clock.now() + 3_600_000 });
});

test('it turns off when a for ends', async () => {
  const ctx = await setupTest({ config: { default: 'off' } });

  await ctx.turnInputs.set({ state: 'on', forMs: 60_000 });

  ctx.clock.advance(60_000);

  const state = await ctx.turnInputs.readState();

  expect(state.state).toBe('off');
});

test('it closes every open capture on off', async () => {
  const ctx = await setupTest();

  const capture = await ctx.turnInputs.openCapture({
    step: { taskID: 'task-a', stepRunID: 'step-1@1' },
    profile: ctx.profile,
    role: 'task',
  });

  await ctx.turnInputs.set({ state: 'off', drop: false });
  await capture.close({ callFrames: 3 });

  const listed = await ctx.turnInputs.list(10);

  expect(listed.misses).toStrictEqual([]);
});

test('it gives an error result with no turn_input_log section', async () => {
  const ctx = await setupTest({ noConfig: true });
  const received3 = await ctx.turnInputs.set({ state: 'on', forMs: null });

  expect(received3).toStrictEqual({
    status: 'not_configured',
  });
});

test('it opens a capture again after on', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.set({ state: 'off', drop: false });
  await ctx.turnInputs.set({ state: 'on', forMs: null });

  const capture = await ctx.turnInputs.openCapture({
    step: { taskID: 'task-a', stepRunID: 'step-1@1' },
    profile: ctx.profile,
    role: 'task',
  });

  expect(capture.baseURL).toContain('/~in.');
});
