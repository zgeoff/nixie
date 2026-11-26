import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readRecordKeys, readRecords, removeRecordKeyFamily } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { itemLabelsCodec } from '../label/item-labels-codec';
import { proposalLabelsCodec } from '../label/proposal-labels-codec';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { createQuotedProposal } from '../test-utils/create-quoted-proposal';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { seedSharedKeyVersion } from '../test-utils/seed-shared-key-version';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';
import { decodeProposalText } from '../utils/decode-proposal-text';
import { readVersionValues } from '../version/read-version-values';
import { readCurrentItemKey } from './read-current-item-key';
import { readItemKeys } from './read-item-keys';

async function setupTest() {
  const memory = await startTestMemory();

  const writeMessage = (text: string) =>
    writeOwnerMessageRecord(memory.log, {
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  return {
    memory,
    writeMessage,
    readSequences: async (kind: 'memory.labelled' | 'memory.proposed' | 'memory.version_added') => {
      const entries = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: [kind],
        limit: 100,
      });

      return entries.map((entry) => entry.record.sequence);
    },
    writeSharedQuoting: (recordSequence: number) =>
      seedSharedKeyVersion(memory.log, {
        text: 'Keeps bees on the allotment',
        evidence: { recordSequence, start: 0, end: 11 },
        evidenceQuote: 'I keep bees',
      }),
    rememberQuoting: (recordSequence: number) =>
      memory.store.remember({
        text: 'Keeps bees on the allotment',
        evidence: { recordSequence, start: 0, end: 11 },
        evidenceQuote: 'I keep bees',
        labels: { gist: 'keeps bees', topic: 'garden', triggers: ['bees'] },
        provenance: buildMockProvenance(),
      }),
  };
}

test('it opens the item ID as the key of a shared-key version that no purge touched', async () => {
  const ctx = await setupTest();
  const item = await seedSharedKeyVersion(ctx.memory.log, { text: 'Walks to work' });
  const [sequence] = await ctx.readSequences('memory.version_added');

  const [key] = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: sequence ?? 0 },
  ]);

  expect(key).toStrictEqual({ status: 'readable', keyID: item.itemID, key: expect.any(CryptoKey) });
});

test('it opens a key of its own for a version a release with version keys wrote', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: buildMockProvenance(),
  });

  const [sequence] = await ctx.readSequences('memory.version_added');

  const [key] = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: sequence ?? 0 },
  ]);

  expect(key).toStrictEqual({
    status: 'readable',
    keyID: expect.stringMatching(new RegExp(`^${item.itemID}/.+`, 'u')),
    key: expect.any(CryptoKey),
  });
});

test('it answers shredded when the key is gone and no purge says why', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: buildMockProvenance(),
  });

  const [sequence] = await ctx.readSequences('memory.version_added');

  await removeRecordKeyFamily(ctx.memory.log, item.itemID);

  const keys = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: sequence ?? 0 },
  ]);

  expect(keys).toStrictEqual([{ status: 'shredded' }]);
});

test('it answers unreadable when the key does not unwrap', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: buildMockProvenance(),
  });

  const [sequence] = await ctx.readSequences('memory.version_added');

  const otherKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const keys = await readItemKeys({ deploymentKey: otherKey, writer: ctx.memory.log.writer }, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: sequence ?? 0 },
  ]);

  expect(keys).toStrictEqual([{ status: 'unreadable' }]);
});

test('it answers removed for each older version and proposal of an item with an unfinished purge, and readable for its current text', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const first = await ctx.writeSharedQuoting(recordSequence);

  const second = await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: first,
    provenance: buildMockProvenance(),
  });

  await createQuotedProposal(ctx.memory, {
    message: 'I now keep three hives.',
    text: 'Keeps three hives',
    quote: 'I now keep three hives',
    target: second,
  });

  const [firstSequence, secondSequence] = await ctx.readSequences('memory.version_added');
  const [proposalSequence] = await ctx.readSequences('memory.proposed');

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [first.itemID] });

  const keys = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: first.itemID, version: 1, sequence: firstSequence ?? 0 },
    { value: 'version', itemID: first.itemID, version: 2, sequence: secondSequence ?? 0 },
    { value: 'proposal', itemID: first.itemID, sequence: proposalSequence ?? 0 },
  ]);

  expect(keys.map((key) => key.status)).toStrictEqual(['removed', 'readable', 'removed']);
});

test('it answers removed for the key that a purge deleted, and readable for the bridge version under its own key', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const item = await ctx.writeSharedQuoting(recordSequence);

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  const [firstSequence, bridgeSequence] = await ctx.readSequences('memory.version_added');

  const keys = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: firstSequence ?? 0 },
    { value: 'version', itemID: item.itemID, version: 2, sequence: bridgeSequence ?? 0 },
  ]);

  expect(keys.map((key) => key.status)).toStrictEqual(['removed', 'readable']);
});

test('it answers removed, never shredded, for a version whose purge closed and deleted its key between the lookup reads', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const item = await ctx.writeSharedQuoting(recordSequence);
  const [firstSequence] = await ctx.readSequences('memory.version_added');

  const refs = [
    { value: 'version' as const, itemID: item.itemID, version: 1, sequence: firstSequence ?? 0 },
  ];

  // A first lookup counts the queries of its 2 reads of the removal marks, so the second lookup
  // can run the whole purge right after its first read, before it reads the keys.
  const counted = { queries: 0 };

  await readItemKeys(
    ctx.memory.log,
    refs,
    ctx.memory.log.writer.db.withPlugin({
      transformQuery: (args) => args.node,
      transformResult: (args) => {
        counted.queries += 1;

        return Promise.resolve(args.result);
      },
    }),
  );

  const attempt = { queries: 0 };

  const keys = await readItemKeys(
    ctx.memory.log,
    refs,
    ctx.memory.log.writer.db.withPlugin({
      transformQuery: (args) => args.node,
      transformResult: async (args) => {
        attempt.queries += 1;

        if (attempt.queries === counted.queries / 2) {
          await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

          await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });
        }

        return args.result;
      },
    }),
  );

  const remaining = await readRecordKeys(ctx.memory.log, [item.itemID]);

  expect(remaining.has(item.itemID)).toBe(false);
  expect(keys).toStrictEqual([{ status: 'removed' }]);
});

test('it answers readable for the labels at the current revision and removed for an earlier one during a purge', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const first = await ctx.rememberQuoting(recordSequence);

  await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: first,
    labels: { gist: 'keeps two hives', topic: 'garden', triggers: ['hives'] },
    provenance: buildMockProvenance(),
  });

  const [olderSequence, newestSequence] = await ctx.readSequences('memory.labelled');

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [first.itemID] });

  const keys = await readItemKeys(ctx.memory.log, [
    { value: 'labels', itemID: first.itemID, sequence: olderSequence ?? 0 },
    { value: 'labels', itemID: first.itemID, sequence: newestSequence ?? 0 },
  ]);

  expect(keys.map((key) => key.status)).toStrictEqual(['removed', 'readable']);
});

test("it answers removed for a bridge version's quote once a forget began on the quoted record", async () => {
  const ctx = await setupTest();
  const removedSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const quotedSequence = await ctx.writeMessage('The hives sit by the shed.');
  const first = await ctx.writeSharedQuoting(removedSequence);

  const second = await seedSharedKeyVersion(ctx.memory.log, {
    target: first,
    text: 'Keeps hives by the shed',
    evidence: { recordSequence: quotedSequence, start: 4, end: 9 },
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

  const read = () =>
    readItemKeys(ctx.memory.log, [
      {
        value: 'version-quote',
        itemID: second.itemID,
        version: 3,
        quote: 'evidence',
        recordSequence: quotedSequence,
      },
    ]);

  const before = await read();

  await seedBegunPurge(ctx.memory.log, { recordSequence: quotedSequence, itemIDs: [] });

  const after = await read();

  expect(before.map((key) => key.status)).toStrictEqual(['readable']);
  expect(after).toStrictEqual([{ status: 'removed' }]);
});

test('it answers the item ID for a writer before any purge, and the next generation key after one', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');
  const item = await ctx.rememberQuoting(recordSequence);
  const before = await readCurrentItemKey(ctx.memory.log, item.itemID);

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  const after = await readCurrentItemKey(ctx.memory.log, item.itemID);

  expect(before).toMatchObject({ status: 'readable', keyID: item.itemID });
  expect(after.status).toBe('readable');
  expect(after).not.toMatchObject({ keyID: item.itemID });
});

test('it answers shredded to a writer when the item key is gone', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: buildMockProvenance(),
  });

  await removeRecordKeyFamily(ctx.memory.log, item.itemID);

  const current = await readCurrentItemKey(ctx.memory.log, item.itemID);

  expect(current).toStrictEqual({ status: 'shredded' });
});

test('it is the only way a module file reads an item key, apart from the 4 listed files', () => {
  const root = join(import.meta.dir, '..');

  // each file here reads a key that is not an item's value key, or reads it as the writer
  const allowed = new Map([
    ['item-key/read-item-keys.ts', 'the lookup itself'],
    ['item-key/read-current-item-key.ts', 'the writer variant, which reads one item key to seal'],
    [
      'version/read-version-quote-seals.ts',
      "reads the key of a quoted record, which no item's key seals",
    ],
    ['utils/record/read-held-record-keys.ts', 'reads the keys a cleanup deletes'],
  ]);

  const importers = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .filter((path) => !path.startsWith('test-utils/'))
    .filter((path) => readFileSync(join(root, path), 'utf8').includes('readRecordKeys'))
    .map((path) => relative('.', path))
    .toSorted();

  expect(importers).toStrictEqual([...allowed.keys()].toSorted());
});

test('it leaves every value of an item no purge reached readable through the read path that 0.77.0 ships', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');
  const item = await ctx.rememberQuoting(sequence);

  const second = await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: item,
    labels: { gist: 'keeps two hives', topic: 'garden', triggers: ['hives'] },
    provenance: buildMockProvenance(),
  });

  const rejected = await createQuotedProposal(ctx.memory, {
    message: 'I keep three hives now.',
    text: 'Keeps three hives on the allotment',
    quote: 'I keep three hives',
    target: second,
  });

  await ctx.memory.store.proposals.reject({
    proposalID: rejected.proposal.proposalID,
    actionHash: rejected.proposal.actionHash,
    identityID: 'identity-1',
    reason: 'Still two hives',
  });

  await ctx.writeMessage('I keep four hives now.');

  await ctx.memory.store.writes.remember({
    text: 'Keeps four hives on the allotment',
    quote: 'I keep four hives',
    target: second,
    labels: { gist: 'keeps four hives', topic: 'garden', triggers: ['hives'] },
    caller: buildMockWriteCaller(),
  });

  // 0.77.0 ships this version reader and the lookup unchanged. It reads each version under its own
  // key; the labels, proposals and rejection keep the item key and the codecs of every release.
  const db = ctx.memory.log.writer.db.$extendTables<MemoryTables>();

  const versionRows = await db
    .selectFrom('memory_versions')
    .select(['item_id', 'version', 'sequence', 'sealed', 'evidence', 'intent_evidence'])
    .where('item_id', '=', item.itemID)
    .orderBy('version')
    .execute();

  const versions = await readVersionValues(ctx.memory.log, ctx.memory.log.writer.db, versionRows);
  const keys = await readRecordKeys(ctx.memory.log, [item.itemID]);

  const key = keys.get(item.itemID);

  invariant(key);

  const labels = await db
    .selectFrom('memory_labels')
    .select(['revision', 'sealed'])
    .orderBy('revision')
    .execute();

  const proposals = await db
    .selectFrom('memory_proposals')
    .select(['proposal_id', 'sealed', 'sealed_labels'])
    .orderBy('proposal_id')
    .execute();

  const opened = await Promise.all(
    labels.map((row) =>
      itemLabelsCodec.decode(key, { itemID: item.itemID, revision: row.revision }, row.sealed),
    ),
  );

  const proposalValues = await Promise.all(
    proposals.map(async (row) => ({
      text: await decodeProposalText(key, row.proposal_id, row.sealed),
      labels:
        row.sealed_labels === null
          ? null
          : await proposalLabelsCodec.decode(key, row.proposal_id, row.sealed_labels),
    })),
  );

  const written = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 200 });

  const rejection = written.find(
    (entry) =>
      entry.record.kind === 'proposals.settled' && entry.record.payload['outcome'] === 'declined',
  );

  expect(versions).toStrictEqual([
    {
      status: 'readable',
      text: {
        text: 'Keeps bees on the allotment',
        evidenceQuote: 'I keep bees',
        intentQuote: null,
      },
    },
    {
      status: 'readable',
      text: { text: 'Keeps two hives on the allotment', evidenceQuote: null, intentQuote: null },
    },
  ]);

  expect(opened.map((labelSet) => labelSet.gist)).toStrictEqual(['keeps bees', 'keeps two hives']);

  expect(
    proposalValues
      .map((value) => ({
        text: value.text.text,
        quote: value.text.quote,
        gist: value.labels?.gist ?? null,
      }))
      .toSorted((left, right) => left.text.localeCompare(right.text)),
  ).toStrictEqual([
    {
      text: 'Keeps four hives on the allotment',
      quote: 'I keep four hives',
      gist: 'keeps four hives',
    },
    { text: 'Keeps three hives on the allotment', quote: 'I keep three hives', gist: null },
  ]);

  expect(rejection?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { reason: 'Still two hives' },
  });
});
