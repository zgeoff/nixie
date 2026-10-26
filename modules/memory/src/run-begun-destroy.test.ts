import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from './moment-types';
import { readMomentRows } from './test-utils/read-moment-rows';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  const memory = await startTestMemory({ cleanupSessions });

  return { memory, cleanupSessions, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it finishes a destroy whose start committed, so the title reads as shredded', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the fox took two of the hens' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night of the fox',
  });

  invariant(kept.status === 'written');

  await writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 1, stage: 'started' },
    },
  ]);

  await ctx.memory.store.moments.finishDestroy(kept.shortID);

  const [record] = await readRecords(ctx.memory.log, {
    afterSequence: kept.sequence - 1,
    limit: 1,
  });

  const rows = await readMomentRows(ctx.db);

  expect(record?.record.erasable).toStrictEqual({ status: 'shredded' });
  expect(rows.moments.map((row) => row.state)).toStrictEqual(['destroyed']);
  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ momentID: kept.momentID });
});

test('it leaves alone a moment that no destroy began', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the fox took two of the hens' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night of the fox',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.finishDestroy(kept.shortID);

  const rows = await readMomentRows(ctx.db);

  expect(rows.moments.map((row) => row.state)).toStrictEqual(['active']);
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
});
