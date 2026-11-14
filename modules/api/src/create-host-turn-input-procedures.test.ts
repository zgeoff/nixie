import { expect, test } from 'bun:test';
import { createTurnInputs } from '@heynixie/turn-inputs';
import { startTestTurnInputs } from '@heynixie/turn-inputs/test-utils';
import { createRouterClient } from '@orpc/server';
import { createHostTurnInputProcedures } from './create-host-turn-input-procedures';

async function setupTest(options: Parameters<typeof startTestTurnInputs>[0] = {}) {
  const ctx = await startTestTurnInputs(options);

  await ctx.turnInputs.runStart();

  const capture = await ctx.turnInputs.openCapture({
    step: { taskID: 'task-a', stepRunID: 'step-1@1' },
    profile: ctx.profile,
    role: 'task',
  });

  await ctx.writeSpoolFile(capture.baseURL, { counter: 1, body: new Uint8Array([1, 2, 3]) });
  await capture.close({ callFrames: 1 });

  const listed = await ctx.turnInputs.list(10);

  return {
    ...ctx,
    inputID: listed.inputs[0]?.inputID ?? '',
    client: createRouterClient(createHostTurnInputProcedures(ctx.turnInputs)),
    staleClient: createRouterClient(
      createHostTurnInputProcedures(
        createTurnInputs({
          ...ctx.turnInputsOptions,
          log: { ...ctx.log, writer: { ...ctx.log.writer, epoch: ctx.log.writer.epoch + 1 } },
        }),
      ),
    ),
    unconfiguredClient: createRouterClient(createHostTurnInputProcedures(undefined)),
  };
}

test('#list shows a request with dates and no key or body', async () => {
  const ctx = await setupTest();
  const listed = await ctx.client.list({ limit: 10 });

  expect(listed).toStrictEqual({
    inputs: [
      expect.objectContaining({
        inputID: ctx.inputID,
        state: 'stored',
        bytes: 3,
        takenAt: expect.any(Date),
        receivedAt: expect.any(Date),
      }),
    ],
    misses: [],
  });

  expect(Object.keys(listed.inputs[0] ?? {})).not.toContain('keyID');
});

test('#open returns the body as base64', async () => {
  const ctx = await setupTest();
  const opened = await ctx.client.open({ inputID: ctx.inputID });

  expect(opened).toStrictEqual({ inputID: ctx.inputID, body: 'AQID' });
});

test('#open gives NOT_FOUND for an ID with no row', async () => {
  const ctx = await setupTest();

  const opening = ctx.client.open({ inputID: 'no-such-input' });

  await Promise.allSettled([opening]);

  expect(opening).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('#open gives REMOVED for a removed request', async () => {
  const ctx = await setupTest();

  await ctx.turnInputs.removeForgotten({ threads: ['task-a'], fromSequence: null });

  const opening = ctx.client.open({ inputID: ctx.inputID });

  await Promise.allSettled([opening]);

  expect(opening).rejects.toMatchObject({ code: 'REMOVED' });
});

test('#open gives OPEN_NOT_RECORDED when the opening cannot be committed', async () => {
  const ctx = await setupTest();

  const opening = ctx.staleClient.open({ inputID: ctx.inputID });

  await Promise.allSettled([opening]);

  expect(opening).rejects.toMatchObject({ code: 'OPEN_NOT_RECORDED' });
});

test('#set caps a for at max_window', async () => {
  const ctx = await setupTest({ config: { max_window: '1h' } });
  const set = await ctx.client.set({ state: 'on', forMs: 86_400_000 });

  expect(set).toStrictEqual({ state: 'on', until: ctx.clock.now() + 3_600_000 });
});

test.each(['list', 'set', 'open'] as const)(
  'it gives NOT_CONFIGURED for %s with no log wired',
  async (name) => {
    const ctx = await setupTest();

    const calls = {
      list: () => ctx.unconfiguredClient.list({ limit: 1 }),
      set: () => ctx.unconfiguredClient.set({ state: 'on', forMs: null }),
      open: () => ctx.unconfiguredClient.open({ inputID: 'x' }),
    };

    const call = calls[name]();

    await Promise.allSettled([call]);

    expect(call).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  },
);
