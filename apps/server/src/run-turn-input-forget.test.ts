import { expect, mock, test } from 'bun:test';
import { createMemoryItem, startTestMemory } from '@heynixie/memory/test-utils';
import { runTurnInputForget } from './run-turn-input-forget';

async function setupTest() {
  const memory = await startTestMemory();

  const closeCaptures = mock(() => Promise.resolve());
  const removeForgotten = mock(() => Promise.resolve());

  return {
    memory,
    closeCaptures,
    removeForgotten,
    forget: (cause: Parameters<typeof runTurnInputForget>[1]) =>
      runTurnInputForget(
        {
          context: {
            log: memory.log,
            clock: memory.log.writer.clock,
            definitions: () => ({ snapshotHash: 'sha256:test' }),
          },
          turnInputs: { closeCaptures, removeForgotten },
        },
        cause,
      ),
  };
}

test('it removes every request taken in at or after a forgotten record, on every thread', async () => {
  const ctx = await setupTest();

  await ctx.forget({ recordSequence: 42 });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({ threads: [], fromSequence: 42 });
});

test('it removes the requests from the first record of a forgotten memory item on', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });

  await ctx.forget({ itemID: item.itemID });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({
    threads: [],
    fromSequence: expect.any(Number),
  });
});

test('it removes every request when no record names the forgotten item', async () => {
  const ctx = await setupTest();

  await ctx.forget({ itemID: crypto.randomUUID() });

  expect(ctx.removeForgotten).toHaveBeenCalledWith({ threads: [], fromSequence: null });
});

test('it ends the open captures of the forgotten tasks before it removes any request', async () => {
  const ctx = await setupTest();

  await ctx.forget({ recordSequence: 7 });

  expect(ctx.closeCaptures).toHaveBeenCalledBefore(ctx.removeForgotten);
  expect(ctx.closeCaptures).toHaveBeenCalledWith({ cause: 'forget', taskIDs: [] });
});

test('it fails the forget when a capture key could not be shredded', async () => {
  const ctx = await setupTest();

  ctx.closeCaptures.mockRejectedValueOnce(new Error('key store busy'));

  const forgetting = ctx.forget({ recordSequence: 7 });

  await Promise.allSettled([forgetting]);

  expect(forgetting).rejects.toThrow('key store busy');
  expect(ctx.removeForgotten).not.toHaveBeenCalled();
});
