import { expect, test } from 'bun:test';
import { createWriterProposal } from './test-utils/create-writer-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

test('it keeps a shared write shared from its review to the item its approval creates', async () => {
  const memory = await startTestMemory();

  const pending = await createWriterProposal(memory, {
    message: 'From now on the bike in the hall is the blue heron.',
    text: 'The owner and the assistant call the bike in the hall the blue heron.',
    quote: 'the bike in the hall is the blue heron',
    subject: 'shared',
  });

  await memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const recalled = await memory.store.recall({});

  expect(pending.subject).toBe('shared');

  expect(recalled.items.map((item) => [item.itemID, item.subject])).toStrictEqual([
    [pending.itemID, 'shared'],
  ]);
});
