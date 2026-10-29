import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions } from './types';

async function setupTest() {
  return {
    memory: await startTestMemory(),
    cleanupSessions: mock<CleanupSessions>(() => Promise.resolve()),
  };
}

test('it resumes a forget that a crash cut short after the key went, and completes it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  startFaultPointFailure('memory.forget.key_removed');

  const crash = await ctx.memory.store
    .forget({
      target: item,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    })
    .catch((error: unknown) => error);

  const restarted = await startNextTestMemory(ctx.memory, { cleanupSessions: ctx.cleanupSessions });
  const records = await readRecords(restarted.log, { afterSequence: 0 });

  expect(crash).toMatchObject({ message: 'crashed at memory.forget.key_removed' });
  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ itemID: item.itemID });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'memory.version_added',
    'memory.forget_started',
    'memory.forgotten',
  ]);
});

test('it leaves an item with no pending forget alone', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restarted = await startNextTestMemory(ctx.memory, { cleanupSessions: ctx.cleanupSessions });
  const result = await restarted.store.recall({ query: 'flowerpot' });

  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});
