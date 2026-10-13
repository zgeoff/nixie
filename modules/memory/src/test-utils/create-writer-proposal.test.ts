import { expect, test } from 'bun:test';
import { createWriterProposal } from './create-writer-proposal';
import { startTestMemory } from './start-test-memory';

test('it returns the pending proposal the memory writer made of the staged write', async () => {
  const memory = await startTestMemory();

  const proposal = await createWriterProposal(memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });
  const pending = await memory.store.proposals.listPending();

  expect(proposal).toMatchObject({
    operation: 'remember',
    targetVersion: null,
    origin: 'memory_writer',
    reason: 'quote_not_typed',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
    sources: [{ origin: 'memory_writer', thread: 'memory-writer' }],
  });
  expect(pending.map((entry) => entry.proposalID)).toStrictEqual([proposal.proposalID]);
});
