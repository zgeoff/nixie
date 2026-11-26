import { expect, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import {
  getDataFilePath,
  getWALPath,
  readRecordKeys,
  readRecords,
  removeRecordKey,
} from '@heynixie/log';
import { readTestRecordKeyRows } from '@heynixie/log/test-utils';
import { readProposal } from '@heynixie/proposals';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import type { QuotedProposal } from '../test-utils/create-quoted-proposal';
import { createQuotedProposal } from '../test-utils/create-quoted-proposal';
import { readPurgeRows } from '../test-utils/read-purge-rows';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { seedForgettingMemoryItem } from '../test-utils/seed-forgetting-memory-item';
import { seedSharedKeyVersion } from '../test-utils/seed-shared-key-version';
import { startKeyStoreReader } from '../test-utils/start-key-store-reader';
import { startNextTestMemory } from '../test-utils/start-next-test-memory';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const memory = await startTestMemory({ gate: { clock }, keyStoreBusyTimeoutMs: 50 });

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
        | 'proposals.settled'
        | 'memory.labelled'
      )[],
    ) => {
      const entries = await readRecords(memory.log, { afterSequence: 0, kinds, limit: 100 });

      return entries.map((entry) => entry.record);
    },
    readKeyIDs: async () => {
      const rows = await readTestRecordKeyRows(memory.writer);

      return new Set(rows.map((row) => row.key_id));
    },
    reject: (proposal: QuotedProposal, reason: string) =>
      memory.store.proposals.reject({
        proposalID: proposal.proposal.proposalID,
        actionHash: proposal.proposal.actionHash,
        identityID: 'identity-1',
        reason,
      }),
  };
}

test('it purges a shared-key item that quotes the record: the older version reads removed, and the current text stays under a bridge version', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const first = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  await seedSharedKeyVersion(ctx.memory.log, {
    target: first,
    text: 'Keeps two hives on the allotment',
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [first.itemID] });

  const result = await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: first.itemID });
  const history = await ctx.memory.store.readHistory(first.itemID);

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
});

test('it purges a version-keyed item that quotes the record: the older version reads removed, the current text stays, and the labels stay readable', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const first = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    labels: ctx.labels,
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: first,
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [first.itemID] });

  const result = await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: first.itemID });
  const history = await ctx.memory.store.readHistory(first.itemID);
  const recalled = await ctx.memory.store.recall({ itemIDs: [first.itemID], limit: 1 });
  const [closed] = await ctx.readKinds(['memory.evidence_purge_closed']);

  expect(result).toBe('purged');

  expect(history?.versions).toMatchObject([
    { version: 1, status: 'shredded', isRemoved: true, isBridge: false },
    {
      version: 2,
      status: 'readable',
      text: 'Keeps two hives on the allotment',
      isRemoved: false,
      isBridge: false,
    },
  ]);

  expect(recalled.items.map((item) => item.gist)).toStrictEqual(['keeps bees']);
  expect(closed?.payload).toMatchObject({ bridgeVersion: null });
});

test('it deletes the generation key of an item with a version key and writes the last mark once', async () => {
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
    bridgeVersion: null,
    labelsRevision: 2,
  });
});

test("it deletes only the item's own keys and its rejection keys, and keeps every key of another item", async () => {
  const ctx = await setupTest();
  const forgotten = await ctx.writeMessage('I keep bees on the allotment.');
  const kept = await ctx.writeMessage('I keep hens in the yard.');

  const purged = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: forgotten, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    labels: ctx.labels,
    provenance: buildMockProvenance(),
  });

  const purgedNext = await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: purged,
    provenance: buildMockProvenance(),
  });

  const rejected = await createQuotedProposal(ctx.memory, {
    message: 'I keep three hives now.',
    text: 'Keeps three hives',
    quote: 'I keep three hives',
    target: purgedNext,
  });

  const beforeRejection = await ctx.readKeyIDs();

  await ctx.reject(rejected, 'Still two hives');

  const afterRejection = await ctx.readKeyIDs();

  await createQuotedProposal(ctx.memory, {
    message: 'I keep four hives now.',
    text: 'Keeps four hives',
    quote: 'I keep four hives',
    target: purgedNext,
  });

  const beforeOther = await ctx.readKeyIDs();

  const other = await ctx.memory.store.remember({
    text: 'Keeps hens in the yard',
    evidence: { recordSequence: kept, start: 0, end: 11 },
    evidenceQuote: 'I keep hens',
    labels: { gist: 'keeps hens', topic: 'garden', triggers: ['hens'] },
    provenance: buildMockProvenance(),
  });

  const otherNext = await ctx.memory.store.remember({
    text: 'Keeps six hens in the yard',
    target: other,
    provenance: buildMockProvenance(),
  });

  const otherRejected = await createQuotedProposal(ctx.memory, {
    message: 'I keep seven hens now.',
    text: 'Keeps seven hens',
    quote: 'I keep seven hens',
    target: otherNext,
  });

  await ctx.reject(otherRejected, 'Still six hens');

  await createQuotedProposal(ctx.memory, {
    message: 'I keep eight hens now.',
    text: 'Keeps eight hens',
    quote: 'I keep eight hens',
    target: otherNext,
  });

  const beforePurge = await ctx.readKeyIDs();

  await seedBegunPurge(ctx.memory.log, { recordSequence: forgotten, itemIDs: [purged.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence: forgotten, itemID: purged.itemID });

  const afterPurge = await ctx.readKeyIDs();

  const rejectionKeyIDs = [...afterRejection].filter((keyID) => !beforeRejection.has(keyID));
  const otherKeyIDs = [...beforePurge].filter((keyID) => !beforeOther.has(keyID));

  const versionKeys = await ctx.memory.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_item_keys')
    .select(['key_id', 'version'])
    .where('item_id', '=', purged.itemID)
    .where('kind', '=', 'version')
    .orderBy('version')
    .execute();

  expect(rejectionKeyIDs).toHaveLength(1);
  expect(versionKeys).toHaveLength(2);
  expect(otherKeyIDs).toIncludeAllMembers([other.itemID]);

  expect([...beforePurge].filter((keyID) => !afterPurge.has(keyID)).toSorted()).toStrictEqual(
    [
      purged.itemID,
      ...versionKeys.slice(0, 1).map((row) => row.key_id),
      ...rejectionKeyIDs,
    ].toSorted(),
  );

  expect(otherKeyIDs.filter((keyID) => !afterPurge.has(keyID))).toStrictEqual([]);
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

  const settled = await ctx.readKinds(['proposals.settled']);
  const row = await readProposal(ctx.memory.writer.db, proposed.proposal.proposalID);
  const pending = await ctx.memory.store.proposals.listPending();

  expect(
    settled.map((record) => [record.payload['proposalID'], record.payload['outcome']]),
  ).toStrictEqual([[proposed.proposal.proposalID, 'lapsed']]);

  expect(row?.state).toBe('lapsed');
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

  expect(closed?.payload).toMatchObject({
    closedKeyIDs: [quoted.proposal.itemID],
    generationKeyID: null,
  });
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

test('it writes no bridge for a shared-key item whose current text does not open, and deletes its keys', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
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

  const first = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: removedSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  const second = await seedSharedKeyVersion(ctx.memory.log, {
    target: first,
    text: 'Keeps hives by the shed',
    evidence: { recordSequence: keptSequence, start: 4, end: 9 },
    evidenceQuote: 'hives',
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

test('it needs no bridge for a shared-key item that an earlier purge gave a version key', async () => {
  const ctx = await setupTest();
  const firstSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const secondSequence = await ctx.writeMessage('The hives sit by the shed.');

  const item = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: firstSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
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

test.each([
  'memory.purge.keys_created',
  'memory.purge.closed',
  'memory.purge.keys_removed',
] as const)(
  'it finishes a purge that a crash cut short at %s, and the current text still reads',
  async (faultPoint) => {
    const ctx = await setupTest();
    const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

    const first = await ctx.memory.store.remember({
      text: 'Keeps bees on the allotment',
      evidence: { recordSequence, start: 0, end: 11 },
      evidenceQuote: 'I keep bees',
      labels: ctx.labels,
      provenance: buildMockProvenance(),
    });

    await ctx.memory.store.remember({
      text: 'Keeps two hives on the allotment',
      target: first,
      provenance: buildMockProvenance(),
    });

    await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [first.itemID] });

    startFaultPointFailure(faultPoint);

    const crash = await ctx.memory.store
      .purgeItemEvidence({ recordSequence, itemID: first.itemID })
      .catch((error: unknown) => error);

    const restarted = await startNextTestMemory(ctx.memory, { gate: { clock: ctx.clock } });

    await restarted.store.finishEvidencePurges({ recordSequence });

    const history = await restarted.store.readHistory(first.itemID);
    const rows = await readPurgeRows(restarted.writer.db);
    const keys = await readRecordKeys(restarted.log, [first.itemID]);

    expect(crash).toMatchObject({ message: `crashed at ${faultPoint}` });
    expect(rows).toMatchObject([{ item_id: first.itemID, purged_sequence: expect.toBeNumber() }]);
    expect(keys.has(first.itemID)).toBe(false);

    expect(history?.versions).toMatchObject([
      { version: 1, status: 'shredded', isRemoved: true },
      { version: 2, status: 'readable', text: 'Keeps two hives on the allotment' },
    ]);
  },
);

test('it counts the purge as done only after the key store checkpoint has cleared the old key from the write-ahead log', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  const reader = await startKeyStoreReader(ctx.memory.dataDir);

  const blocked = await ctx.memory.store
    .purgeItemEvidence({ recordSequence, itemID: item.itemID })
    .catch((error: unknown) => error);

  const whileHeld = await readPurgeRows(ctx.memory.writer.db);

  await reader.release();

  const finished = await ctx.memory.store.purgeItemEvidence({
    recordSequence,
    itemID: item.itemID,
  });

  const afterRelease = await readPurgeRows(ctx.memory.writer.db);

  const keysWAL = getWALPath(getDataFilePath(ctx.memory.dataDir, 'keys.db'));

  expect(blocked).toMatchObject({ name: 'KeyStoreBusyError' });

  expect(whileHeld).toMatchObject([
    { closed_sequence: expect.toBeNumber(), purged_sequence: null },
  ]);

  expect(finished).toBe('purged');
  expect(afterRelease).toMatchObject([{ purged_sequence: expect.toBeNumber() }]);
  expect(stat(keysWAL)).resolves.toMatchObject({ size: 0 });
});

test('it does not count the purge of a pending proposal for a new item as done while the key store checkpoint is blocked', async () => {
  const ctx = await setupTest();

  const quoted = await createQuotedProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  const request = { recordSequence: quoted.recordSequence, itemID: quoted.proposal.itemID };

  await seedBegunPurge(ctx.memory.log, {
    recordSequence: quoted.recordSequence,
    itemIDs: [quoted.proposal.itemID],
  });

  const reader = await startKeyStoreReader(ctx.memory.dataDir);
  const first = await ctx.memory.store.purgeItemEvidence(request).catch((error: unknown) => error);
  const second = await ctx.memory.store.purgeItemEvidence(request).catch((error: unknown) => error);
  const whileHeld = await readPurgeRows(ctx.memory.writer.db);

  await reader.release();

  const finished = await ctx.memory.store.purgeItemEvidence(request);

  expect(first).toMatchObject({ name: 'KeyStoreBusyError' });
  expect(second).toMatchObject({ name: 'KeyStoreBusyError' });
  expect(whileHeld).toMatchObject([{ purged_sequence: null }]);
  expect(finished).toBe('purged');
});
