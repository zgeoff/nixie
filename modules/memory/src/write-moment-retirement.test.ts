import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from './moment-types';
import { readMomentRows } from './test-utils/read-moment-rows';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it retires a moment and restores it, and a rebuild gives the same rows', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the spare key goes under the blue pot' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Where the spare key went',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'The pot was the only dry spot.' },
  });

  await ctx.memory.store.moments.retire({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 2 },
    isRetired: true,
  });

  const restored = await ctx.memory.store.moments.retire({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 3 },
    isRetired: false,
  });

  invariant(restored.status === 'written');

  const live = await readMomentRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMomentRows(ctx.db);

  expect(live.moments).toMatchObject([{ state: 'active', version: 4 }]);
  expect(rebuilt).toStrictEqual(live);
});

test('it marks a retired moment retired', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the spare key goes under the blue pot' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Where the spare key went',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    isRetired: true,
  });

  const row = await ctx.db.selectFrom('moments').select('state').executeTakeFirstOrThrow();

  expect(row.state).toBe('retired');
});

test('it refuses to restore a moment that is active', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the spare key goes under the blue pot' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Where the spare key went',
  });

  invariant(kept.status === 'written');

  const restored = await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    isRetired: false,
  });

  expect(restored).toStrictEqual({ status: 'refused', reason: 'wrong_state' });
});

test('it refuses a moment it never kept', async () => {
  const ctx = await setupTest();

  const retired = await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: 'q4n8v2hw6t', version: 1 },
    isRetired: true,
  });

  expect(retired).toStrictEqual({ status: 'refused', reason: 'not_found' });
});
