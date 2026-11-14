import { expect, test } from 'bun:test';
import { readPurgeSet } from './read-purge-set';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { createMemoryItem } from './test-utils/create-memory-item';
import { createQuotedProposal } from './test-utils/create-quoted-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it returns each live item that quotes the record, and each pending new-item proposal that quotes it', async () => {
  const ctx = await setupTest();

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  const evidence = { recordSequence: quoted.recordSequence, start: 0, end: 5 };

  const viaVersion = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    evidence,
    evidenceQuote: 'bees',
    provenance: buildMockProvenance(),
  });

  const viaIntent = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe' });

  await ctx.memory.store.retire({
    target: viaIntent,
    intentEvidence: evidence,
    intentQuote: 'bees',
    provenance: buildMockProvenance(),
  });

  const unrelated = await ctx.memory.store.remember({
    text: 'Likes tea',
    evidence: { recordSequence: quoted.recordSequence + 100, start: 0, end: 3 },
    evidenceQuote: 'tea',
    provenance: buildMockProvenance(),
  });

  const set = await readPurgeSet(ctx.memory.log.writer.db, quoted.recordSequence);

  expect(set).toStrictEqual(
    [quoted.proposal.itemID, viaVersion.itemID, viaIntent.itemID].toSorted(),
  );

  expect(set).not.toContain(unrelated.itemID);
});

test('it leaves out an item that a forget began on, and a rejected proposal for a new item', async () => {
  const ctx = await setupTest();

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  await ctx.memory.store.proposals.reject({
    proposalID: quoted.proposal.proposalID,
    actionHash: quoted.proposal.actionHash,
    identityID: 'identity-1',
  });

  const forgotten = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    evidence: { recordSequence: quoted.recordSequence, start: 0, end: 5 },
    evidenceQuote: 'bees',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.forget({ target: forgotten, provenance: buildMockProvenance() });

  const set = await readPurgeSet(ctx.memory.log.writer.db, quoted.recordSequence);

  expect(set).toStrictEqual([]);
});

test('it returns an item whose rejected proposal quotes the record', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep two hives now.',
    text: 'Keeps two hives of bees.',
    quote: 'two hives',
    target: item,
  });

  await ctx.memory.store.proposals.reject({
    proposalID: quoted.proposal.proposalID,
    actionHash: quoted.proposal.actionHash,
    identityID: 'identity-1',
  });

  const set = await readPurgeSet(ctx.memory.log.writer.db, quoted.recordSequence);

  expect(set).toStrictEqual([item.itemID]);
});
