import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { MemoryTables } from '../types';
import { memoryExportSchema } from '../utils/schema/memory-export-schema';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    readItemRow: () =>
      memory.writer.db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_items')
        .select(['version', 'label_edits'])
        .executeTakeFirstOrThrow(),
    readLabelRows: () =>
      memory.writer.db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_labels')
        .select(['revision', 'version', 'change'])
        .orderBy('sequence')
        .execute(),
    approveOnlyProposal: async () => {
      const [proposal] = await memory.store.proposals.listPending();

      invariant(proposal);

      return memory.store.proposals.approve({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: 'host',
      });
    },
  };
}

test('it proposes an edit of labels only with the labels reason, whatever the caller', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The piano is tuned each March by the same tuner',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: ['piano'] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: ['piano', 'out of tune'] },
    caller: buildMockWriteCaller(),
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(outcome.status).toBe('proposed');

  expect(pending).toMatchObject([
    {
      reason: 'labels',
      labels: { gist: 'piano tuning', topic: 'home', isLabelOnly: true },
    },
  ]);
});

test('it adds 1 to the revision and keeps the text version when a label-only proposal is approved', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The piano is tuned each March by the same tuner',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  const result = await ctx.approveOnlyProposal();
  const row = await ctx.readItemRow();
  const labelRows = await ctx.readLabelRows();

  expect(result).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
  expect(row).toStrictEqual({ version: 1, label_edits: 1 });

  expect(labelRows).toStrictEqual([
    { revision: 1, version: 1, change: 'written' },
    { revision: 2, version: 1, change: 'edited' },
  ]);
});

test('it refuses a retire that names the revision before a label edit', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The piano is tuned each March by the same tuner',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  await ctx.approveOnlyProposal();

  const retire = ctx.memory.store.retire({ target: item, provenance: buildMockProvenance() });

  await retire.catch(() => {});

  expect(retire).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('it exports the labels and the label history of an item with an edited label', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The piano is tuned each March by the same tuner',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.writes.editLabels({
    target: item,
    labels: { gist: 'piano tuning', topic: 'home', triggers: [] },
    caller: buildMockWriteCaller(),
  });

  await ctx.approveOnlyProposal();

  const chunks = await Array.fromAsync(ctx.memory.store.view.readExport({ exportedAt: 0 }));

  const items = memoryExportSchema.safeParse(JSON.parse(chunks.join(''))).data?.items;

  expect(items).toMatchObject([
    {
      labels: { gist: 'piano tuning', topic: 'home', triggers: [] },
      labelHistory: [
        { revision: 1, version: 1, change: 'written', gist: 'piano tuned each March' },
        { revision: 2, version: 1, change: 'edited', gist: 'piano tuning' },
      ],
    },
  ]);
});
