import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readRecordKeys, readRecords, removeRecordKey } from '@heynixie/log';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { createQuotedProposal } from '../test-utils/create-quoted-proposal';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
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

test('it opens the key of a version that no purge touched, which is the item ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: buildMockProvenance(),
  });

  const [sequence] = await ctx.readSequences('memory.version_added');

  const [key] = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: sequence ?? 0 },
  ]);

  expect(key).toStrictEqual({ status: 'readable', keyID: item.itemID, key: expect.any(CryptoKey) });
});

test('it answers shredded when the key is gone and no purge says why', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: buildMockProvenance(),
  });

  const [sequence] = await ctx.readSequences('memory.version_added');

  await removeRecordKey(ctx.memory.log, item.itemID);

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
  const first = await ctx.rememberQuoting(recordSequence);

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
  const item = await ctx.rememberQuoting(recordSequence);

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence, itemID: item.itemID });

  const [firstSequence, bridgeSequence] = await ctx.readSequences('memory.version_added');

  const keys = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: firstSequence ?? 0 },
    { value: 'version', itemID: item.itemID, version: 2, sequence: bridgeSequence ?? 0 },
  ]);

  expect(keys.map((key) => key.status)).toStrictEqual(['removed', 'readable']);
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
  const first = await ctx.rememberQuoting(removedSequence);

  const second = await ctx.memory.store.remember({
    text: 'Keeps hives by the shed',
    target: first,
    evidence: { recordSequence: quotedSequence, start: 4, end: 9 },
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

  await removeRecordKey(ctx.memory.log, item.itemID);

  const current = await readCurrentItemKey(ctx.memory.log, item.itemID);

  expect(current).toStrictEqual({ status: 'shredded' });
});

test('it is the only way a module file reads an item key, apart from the 4 listed files', () => {
  const root = join(import.meta.dir, '..');

  // each file here reads a key that is not an item's value key, or reads it as the writer
  const allowed = new Map([
    ['item-key/read-item-keys.ts', 'the lookup itself'],
    ['item-key/read-current-item-key.ts', 'the writer variant, which reads one item key to seal'],
    ['purge/read-bridge-quotes.ts', "reads the key of a quoted record, which no item's key seals"],
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

test('it seals every value of an item no purge reached under the key the release before reads', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');
  const item = await ctx.rememberQuoting(sequence);

  await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: item,
    provenance: buildMockProvenance(),
  });

  const proposal = await createQuotedProposal(ctx.memory, {
    message: 'I keep three hives now.',
    text: 'Keeps three hives on the allotment',
    quote: 'I keep three hives',
    target: { itemID: item.itemID, version: 2 },
  });

  const versions = await ctx.readSequences('memory.version_added');
  const proposals = await ctx.readSequences('memory.proposed');
  const labelled = await ctx.readSequences('memory.labelled');
  const olderKeys = await readRecordKeys(ctx.memory.log, [item.itemID]);

  const keys = await readItemKeys(ctx.memory.log, [
    { value: 'version', itemID: item.itemID, version: 1, sequence: versions[0] ?? 0 },
    { value: 'version', itemID: item.itemID, version: 2, sequence: versions[1] ?? 0 },
    { value: 'proposal', itemID: item.itemID, sequence: proposals[0] ?? 0 },
    { value: 'labels', itemID: item.itemID, sequence: labelled[0] ?? 0 },
  ]);

  const kinds = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 100 });

  expect(proposal).toBeDefined();
  expect(olderKeys.get(item.itemID)).toBeInstanceOf(CryptoKey);

  expect(keys.map((key) => (key.status === 'readable' ? key.keyID : key.status))).toStrictEqual([
    item.itemID,
    item.itemID,
    item.itemID,
    item.itemID,
  ]);

  expect(
    kinds.filter((entry) =>
      [
        'memory.version_keyed',
        'memory.evidence_purge_started',
        'memory.evidence_purge_closed',
        'memory.evidence_purged',
      ].includes(entry.record.kind),
    ),
  ).toStrictEqual([]);
});
