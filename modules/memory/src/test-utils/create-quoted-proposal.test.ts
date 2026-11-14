import { expect, test } from 'bun:test';
import { createQuotedProposal } from './create-quoted-proposal';
import { startTestMemory } from './start-test-memory';

test('it makes a pending proposal whose evidence names the message it quotes', async () => {
  const memory = await startTestMemory();

  const quoted = await createQuotedProposal(memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  expect(quoted.proposal.evidence).toStrictEqual({
    recordSequence: quoted.recordSequence,
    start: 0,
    end: 11,
  });
});
