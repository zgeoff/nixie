import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockWriteCaller } from './build-mock-write-caller';
import { createProposal } from './create-proposal';
import { startTestMemory } from './start-test-memory';

test('it returns the pending proposal for a new item', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, { text: 'Likes jazz' });

  expect(proposal).toMatchObject({
    operation: 'remember',
    targetVersion: null,
    reason: 'no_quote',
    text: 'Likes jazz',
  });
});

test('it returns the pending proposal for an edit of the item it names', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(memory.store, {
    text: 'Lives on Oak Avenue',
    target: item,
  });

  expect(proposal).toMatchObject({
    itemID: item.itemID,
    targetVersion: 1,
    text: 'Lives on Oak Avenue',
  });
});

test('it makes the proposal through the caller given', async () => {
  const memory = await startTestMemory();

  const proposal = await createProposal(memory.store, {
    text: 'Likes jazz',
    caller: buildMockWriteCaller({ model: 'claude-test-1' }),
  });

  const records = await readRecords(memory.log, { afterSequence: 0, kinds: ['memory.proposed'] });

  expect(records.map((entry) => entry.record.payload)).toMatchObject([
    { proposalID: proposal.proposalID, model: 'claude-test-1' },
  ]);
});
