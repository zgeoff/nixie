import { expect, test } from 'bun:test';
import { removeRecordKey } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readRecordForgetPreview } from './read-record-forget-preview';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { createQuotedProposal } from './test-utils/create-quoted-proposal';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it counts the moments that hold the record, leaving out a destroyed one and one on another record', async () => {
  const ctx = await setupTest();

  const first = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'the cat learned the flap today',
    spans: [],
  });

  const second = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'and then it went out',
    spans: [],
  });

  const keep = (title: string, firstSequence: number, lastSequence: number) =>
    ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence,
      lastSequence,
      title,
    });

  const active = await keep('The cat flap', first, second);
  const retired = await keep('The first night out', first, first);

  await keep('Later', second, second);

  const destroyed = await keep('Gone', first, first);

  invariant(active.status === 'written' && retired.status === 'written');
  invariant(destroyed.status === 'written');

  await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: retired.momentID, version: 1 },
    isRetired: true,
  });

  await ctx.memory.store.moments.destroy({ momentID: destroyed.momentID, version: 1 });

  const preview = await readRecordForgetPreview(ctx.memory.log, {
    thread: 'conversation',
    sequence: first,
  });

  expect(preview).toStrictEqual({ momentCount: 2, memoryItems: [] });
});

test('it lists each item that quotes the record with its current text, and a pending new-item proposal with its text', async () => {
  const ctx = await setupTest();

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    evidence: { recordSequence: quoted.recordSequence, start: 0, end: 5 },
    evidenceQuote: 'I kee',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'Keeps two hives of bees on the roof',
    target: item,
    provenance: buildMockProvenance(),
  });

  const preview = await readRecordForgetPreview(ctx.memory.log, {
    thread: 'conversation',
    sequence: quoted.recordSequence,
  });

  expect(preview).toStrictEqual({
    momentCount: 0,
    memoryItems: [
      { itemID: item.itemID, text: 'Keeps two hives of bees on the roof' },
      { itemID: quoted.proposal.itemID, text: 'The owner keeps bees.' },
    ].toSorted((left, right) => left.itemID.localeCompare(right.itemID)),
  });
});

test('it leaves out an item whose text does not read', async () => {
  const ctx = await setupTest();

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    evidence: { recordSequence: quoted.recordSequence, start: 0, end: 5 },
    evidenceQuote: 'I kee',
    provenance: buildMockProvenance(),
  });

  await removeRecordKey(ctx.memory.log, item.itemID);

  const preview = await readRecordForgetPreview(ctx.memory.log, {
    thread: 'conversation',
    sequence: quoted.recordSequence,
  });

  expect(preview.memoryItems).toStrictEqual([
    { itemID: quoted.proposal.itemID, text: 'The owner keeps bees.' },
  ]);
});
