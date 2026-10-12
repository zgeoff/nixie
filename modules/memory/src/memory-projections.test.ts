import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import { readMemoryRows } from './test-utils/read-memory-rows';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.withTables<MemoryTables>() };
}

test('it rebuilds an edited, retired and undone item equal to the live rows', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    evidenceQuote: 'my flat on Elm Street',
    evidence: { recordSequence: 4, start: 3, end: 21 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const moved = await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: {
      origin: 'task',
      source: 'owner',
      taskID: 'task-1',
      proposalID: 'p-1',
      checks: { quote: 'pass' },
    },
  });
  const retired = await ctx.memory.store.retire({
    target: moved,
    intentQuote: 'I moved out',
    intentEvidence: { recordSequence: 9, start: 2, end: 13 },
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });
  await ctx.memory.store.undo({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.versions).toHaveLength(4);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds pinned, unpinned and forgotten items equal to the live rows', async () => {
  const ctx = await setupTest();
  const pinned = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const forgotten = await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: pinned.itemID,
    isPinned: false,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  await ctx.memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.items).toMatchObject([
    { state: expect.toBeOneOf(['active', 'forgotten']) },
    { state: expect.toBeOneOf(['active', 'forgotten']) },
  ]);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds a restored item equal to the live rows', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.restore({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.versions).toHaveLength(3);
  expect(rebuilt).toStrictEqual(live);
});
