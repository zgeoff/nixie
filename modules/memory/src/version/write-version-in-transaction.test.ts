import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { seedSharedKeyVersion } from '../test-utils/seed-shared-key-version';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    writeMessage: (text: string) =>
      writeOwnerMessageRecord(memory.log, {
        thread: 'conversation',
        text,
        spans: [{ start: 0, end: text.length, source: 'typed' }],
      }),
    removeMessageKey: async (sequence: number) => {
      const row = await memory.log.writer.db
        .$extendTables<LogTables>()
        .selectFrom('records')
        .select('key_id')
        .where('sequence', '=', sequence)
        .executeTakeFirst();

      const keyID = row?.key_id;

      invariant(
        keyID !== undefined && keyID !== null && keyID !== '',
        `record ${String(sequence)} has no key`,
      );

      await removeRecordKey(memory.log, keyID);
    },
    readQuotes: async (itemID: string) => {
      const detail = await memory.store.view.readItem(itemID);

      return detail?.versions.map((version) => version.evidenceQuote) ?? [];
    },
  };
}

test('it stores a version under its own key and reads its quote while the quoted record has its key', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const keys = await ctx.memory.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_item_keys')
    .select(['kind', 'version'])
    .where('item_id', '=', item.itemID)
    .execute();

  expect(keys).toStrictEqual([{ kind: 'version', version: 1 }]);

  const quotes = await ctx.readQuotes(item.itemID);

  expect(quotes).toStrictEqual(['I keep bees']);
});

test('it stores no quote for a version written after the quoted record lost its key', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  await ctx.removeMessageKey(sequence);

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const history = await ctx.memory.store.readHistory(item.itemID);
  const quotes = await ctx.readQuotes(item.itemID);

  expect(quotes).toStrictEqual([null]);
  expect(history?.versions).toMatchObject([{ text: 'Keeps bees on the allotment' }]);
});

test('it keeps the quote of the version that a retire copies', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.retire({ target: item, provenance: buildMockProvenance() });

  const quotes = await ctx.readQuotes(item.itemID);

  expect(quotes).toStrictEqual(['I keep bees', 'I keep bees']);
});

test('it keeps the quote of the version that a restore copies', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.restore({ target: retired, provenance: buildMockProvenance() });

  const quotes = await ctx.readQuotes(item.itemID);

  expect(quotes).toStrictEqual(['I keep bees', 'I keep bees', 'I keep bees']);
});

test('it keeps the quote of the earlier version that an undo copies', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const first = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const second = await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: first,
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.undo({ target: second, provenance: buildMockProvenance() });

  const quotes = await ctx.readQuotes(first.itemID);

  expect(quotes).toStrictEqual(['I keep bees', null, 'I keep bees']);
});

test('it seals a fresh quote when a retire copies a shared-key version while its record has the key', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  await ctx.memory.store.retire({ target: item, provenance: buildMockProvenance() });

  const quotes = await ctx.readQuotes(item.itemID);

  expect(quotes).toStrictEqual(['I keep bees', 'I keep bees']);
});

test('it stores no quote when a retire copies a shared-key version whose record lost its key', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  await ctx.removeMessageKey(sequence);
  await ctx.memory.store.retire({ target: item, provenance: buildMockProvenance() });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history?.versions).toMatchObject([
    { text: 'Keeps bees on the allotment' },
    { text: 'Keeps bees on the allotment' },
  ]);

  const quotes = await ctx.readQuotes(item.itemID);

  expect(quotes[1]).toBeNull();
});

test('it reads the current text, no quote and every older version as removed after a purge of a version-keyed item', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const first = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const second = await ctx.memory.store.remember({
    text: 'Keeps two hives on the allotment',
    target: first,
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await ctx.removeMessageKey(sequence);

  await seedBegunPurge(ctx.memory.log, { recordSequence: sequence, itemIDs: [second.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence: sequence, itemID: second.itemID });

  const history = await ctx.memory.store.readHistory(second.itemID);

  expect(history?.versions).toMatchObject([
    { version: 1, status: 'shredded', isRemoved: true },
    { version: 2, status: 'readable', text: 'Keeps two hives on the allotment' },
  ]);

  const quotes = await ctx.readQuotes(second.itemID);

  expect(quotes.at(-1)).toBeNull();
});

test('it reads the current text, no quote and every older version as removed after a purge of a shared-key item', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const first = await seedSharedKeyVersion(ctx.memory.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  const second = await seedSharedKeyVersion(ctx.memory.log, {
    target: first,
    text: 'Keeps two hives on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  await ctx.removeMessageKey(sequence);

  await seedBegunPurge(ctx.memory.log, { recordSequence: sequence, itemIDs: [second.itemID] });

  await ctx.memory.store.purgeItemEvidence({ recordSequence: sequence, itemID: second.itemID });

  const history = await ctx.memory.store.readHistory(second.itemID);

  expect(history?.versions).toMatchObject([
    { version: 1, status: 'shredded', isRemoved: true },
    { version: 2, status: 'shredded', isRemoved: true },
    {
      version: 3,
      status: 'readable',
      text: 'Keeps two hives on the allotment',
      isBridge: true,
    },
  ]);

  const quotes = await ctx.readQuotes(second.itemID);

  expect(quotes.at(-1)).toBeNull();
});
