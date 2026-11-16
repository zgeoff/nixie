import { expect, test } from 'bun:test';
import { readRecordKeys, readRecords, removeRecordKey } from '@heynixie/log';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { createQuotedProposal } from '../test-utils/create-quoted-proposal';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { seedForgettingMemoryItem } from '../test-utils/seed-forgetting-memory-item';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { VersionRef } from '../types';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  return {
    memory,
    clock,
    labels: { gist: 'keeps bees', topic: 'garden', triggers: ['bees'] },
    writeMessage: (text: string) =>
      writeOwnerMessageRecord(memory.log, {
        thread: 'conversation',
        text,
        spans: [{ start: 0, end: text.length, source: 'typed' }],
      }),
    readKinds: async (
      kinds: readonly (
        | 'memory.evidence_purge_closed'
        | 'memory.evidence_purged'
        | 'memory.version_keyed'
        | 'memory.proposal_lapsed'
        | 'memory.labelled'
      )[],
    ) => {
      const entries = await readRecords(memory.log, { afterSequence: 0, kinds, limit: 100 });

      return entries.map((entry) => entry.record);
    },
  };
}

test('it purges an item that quotes the record: the older version reads removed, the current text stays under a bridge version, and the labels stay readable', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const first = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    labels: ctx.labels,
    provenance: buildMockProvenance(),
  });

  const second = await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: first,
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [first.itemID] });

  const result = await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: first.itemID });
  const history = await ctx.memory.store.readHistory(first.itemID);
  const recalled = await ctx.memory.store.recall({ itemIDs: [first.itemID], limit: 1 });

  expect(result).toBe('purged');

  expect(history?.versions).toMatchObject([
    { version: 1, status: 'shredded', isRemoved: true, isBridge: false },
    { version: 2, status: 'shredded', isRemoved: true, isBridge: false },
    {
      version: 3,
      status: 'readable',
      text: 'Keeps two hives on the allotment',
      isRemoved: false,
      isBridge: true,
    },
  ]);

  expect(recalled.items.map((item) => item.gist)).toStrictEqual(['keeps bees']);
  expect(second.version).toBe(2);
});

test('it deletes every closed key of the item and writes the last mark once', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    labels: ctx.labels,
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  const [closed] = await ctx.readKinds(['memory.evidence_purge_closed']);
  const purged = await ctx.readKinds(['memory.evidence_purged']);
  const keys = await readRecordKeys(ctx.memory.log, [item.itemID]);

  expect(keys.has(item.itemID)).toBe(false);
  expect(purged).toHaveLength(1);

  expect(closed?.payload).toMatchObject({
    recordSequence,
    itemID: item.itemID,
    closedKeyIDs: [item.itemID],
    bridgeVersion: 2,
    labelsRevision: 3,
  });
});

test('it writes nothing when the purge runs again', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  const before = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 500 });
  const again = await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });
  const after = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 500 });

  expect(again).toBe('skipped');
  expect(after).toHaveLength(before.length);
});

test('it lapses each pending proposal of the item', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const proposed = await createQuotedProposal(ctx.memory, {
    message: 'I now keep three hives.',
    text: 'Keeps three hives',
    quote: 'I now keep three hives',
    target: item,
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  const lapsed = await ctx.readKinds(['memory.proposal_lapsed']);
  const pending = await ctx.memory.store.proposals.listPending();

  expect(lapsed.map((record) => record.payload)).toStrictEqual([
    { proposalID: proposed.proposal.proposalID },
  ]);

  expect(pending).toStrictEqual([]);
});

test('it lapses a pending proposal for a new item and deletes its key', async () => {
  const ctx = await setupTest();

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  await seedBegunPurge(ctx.memory.log, {
    recordSequence: quoted.recordSequence,
    itemIDs: [quoted.proposal.itemID],
  });

  const result = await ctx.memory.store.purgeItemEvidence({
    recordSequence: quoted.recordSequence,
    itemID: quoted.proposal.itemID,
  });

  const keys = await readRecordKeys(ctx.memory.log, [quoted.proposal.itemID]);
  const [closed] = await ctx.readKinds(['memory.evidence_purge_closed']);
  const pending = await ctx.memory.store.proposals.listPending();

  expect(result).toBe('purged');
  expect(keys.has(quoted.proposal.itemID)).toBe(false);
  expect(pending).toStrictEqual([]);
  expect(closed?.payload).toMatchObject({ closedKeyIDs: [], generationKeyID: null });
});

test('it skips an item that is forgetting', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await seedForgettingMemoryItem(
    { store: ctx.memory.store, log: ctx.memory.log, clock: ctx.clock },
    {},
  );

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  const result = await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  expect(result).toBe('skipped');
});

test('it skips an item that no purge set names', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    provenance: buildMockProvenance(),
  });

  const result = await ctx.memory.store.purgeItemEvidence({
    recordSequence: 1,
    itemID: item.itemID,
  });

  expect(result).toBe('skipped');
});

test('it writes no bridge for an item whose current text does not open, and deletes its keys', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await removeRecordKey(ctx.memory.log, item.itemID);
  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  const result = await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });
  const history = await ctx.memory.store.readHistory(item.itemID);
  const keyed = await ctx.readKinds(['memory.version_keyed']);

  expect(result).toBe('purged');
  expect(history?.versions).toHaveLength(1);
  expect(keyed).toStrictEqual([]);
});

test("it keeps a bridge version's quote of another record while that record has its key, and drops it with the key", async () => {
  const ctx = await setupTest();
  const removedSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const keptSequence = await ctx.writeMessage('The hives sit by the shed.');

  const first = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: removedSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const second = await ctx.memory.store.remember({
    text: 'Keeps hives by the shed',
    target: first,
    evidence: { recordSequence: keptSequence, start: 4, end: 9 },
    evidenceQuote: 'hives',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, {
    recordSequence: removedSequence,
    itemIDs: [second.itemID],
  });

  await ctx.memory.store.purgeItemEvidence({
    recordSequence: removedSequence,
    itemID: second.itemID,
  });

  const beforeDetail = await ctx.memory.store.view.readItem(second.itemID);
  const keys = await readTestRecordKeyRows(ctx.memory.writer);

  const recordKeys = keys.filter((key) => !key.key_id.startsWith(second.itemID));

  for (const recordKey of recordKeys) {
    await removeRecordKey(ctx.memory.log, recordKey.key_id);
  }

  const afterDetail = await ctx.memory.store.view.readItem(second.itemID);

  expect(beforeDetail?.versions.at(-1)?.evidenceQuote).toBe('hives');
  expect(afterDetail?.versions.at(-1)?.evidenceQuote).toBeNull();
});

test('it needs no bridge for an item that a purge already gave a version key', async () => {
  const ctx = await setupTest();
  const firstSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const secondSequence = await ctx.writeMessage('The hives sit by the shed.');

  const item: VersionRef = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: firstSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence: firstSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence: firstSequence, itemID: item.itemID });

  await seedBegunPurge(ctx.memory.log, { recordSequence: secondSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({
    recordSequence: secondSequence,
    itemID: item.itemID,
  });

  const closed = await ctx.readKinds(['memory.evidence_purge_closed']);
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(closed.map((record) => record.payload['bridgeVersion'])).toStrictEqual([2, null]);

  expect(history?.versions.map((version) => version.status)).toStrictEqual([
    'shredded',
    'readable',
  ]);
});
