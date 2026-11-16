import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockWriteCaller, createProposal, startTestMemory } from '../test-utils';
import type { MemoryTables } from '../types';

test('it approves a creating proposal that has no label record and labels the new item from its text and subject', async () => {
  const memory = await startTestMemory();

  const proposal = await createProposal(memory.store, {
    text: 'The piano is tuned each March',
    caller: buildMockWriteCaller(),
  });

  const written = await readRecords(memory.log, { afterSequence: 0, limit: 1000 });

  const result = await memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
  });

  const rows = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .select(['revision', 'version', 'change', 'origin'])
    .execute();

  const recalled = await memory.store.recall({ itemIDs: [proposal.itemID] });

  expect(written.map((entry) => entry.record.kind)).not.toContain('memory.proposal_labelled');
  expect(result).toStrictEqual({ status: 'applied', itemID: proposal.itemID, version: 1 });

  expect(rows).toStrictEqual([
    { revision: 1, version: 1, change: 'backfilled', origin: 'migration' },
  ]);

  expect(recalled.items).toMatchObject([
    { gist: 'The piano is tuned each March', topic: 'owner', triggers: [] },
  ]);
});
