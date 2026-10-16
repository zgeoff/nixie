import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startFaultPointFailure } from './test-utils/start-fault-point-failure';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  return { memory: await startTestMemory({ cleanupSessions }), cleanupSessions };
}

test('it completes a forget whose cleanup failed after the key went', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'The gate code is 4417' });

  startFaultPointFailure('memory.forget.key_removed');

  const failed = await ctx.memory.store
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

  await ctx.memory.store.finishForget(item.itemID);

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(failed).toMatchObject({ message: 'crashed at memory.forget.key_removed' });
  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ itemID: item.itemID });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'memory.version_added',
    'memory.forget_started',
    'memory.forgotten',
  ]);
});

test('it leaves an item no forget began with its key and its text', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'The gate code is 4417' });

  await ctx.memory.store.finishForget(item.itemID);

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(ctx.cleanupSessions).not.toHaveBeenCalled();

  expect(detail).toMatchObject({
    state: 'active',
    status: 'readable',
    text: 'The gate code is 4417',
  });
});

test('it runs nothing again for a completed forget', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'The gate code is 4417' });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.finishForget(item.itemID);

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(ctx.cleanupSessions).toHaveBeenCalledOnce();
  expect(records.filter((entry) => entry.record.kind === 'memory.forgotten')).toHaveLength(1);
});
