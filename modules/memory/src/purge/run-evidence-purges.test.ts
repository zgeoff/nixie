import { expect, test } from 'bun:test';
import { erasureFinishedCodec, writeRecords } from '@heynixie/log';
import { recordForgottenCodec } from '../record/record-forgotten-codec';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { readPurgeRows } from '../test-utils/read-purge-rows';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { seedBegunRecordErasurePurge } from '../test-utils/seed-begun-record-erasure-purge';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';

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
    writeForgotten: (recordSequence: number) =>
      writeRecords(memory.log, [
        {
          kind: recordForgottenCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          payload: recordForgottenCodec.encode({ recordSequence }),
        },
      ]),
  };
}

test('it finishes, for the purges no open forget owns, the purge of a forgotten item whose record forget ended without it', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });
  await ctx.writeForgotten(recordSequence);
  await ctx.memory.store.finishEvidencePurges({ isUnowned: true });

  const rows = await readPurgeRows(ctx.memory.writer.db);

  expect(rows).toStrictEqual([
    {
      record_sequence: recordSequence,
      item_id: item.itemID,
      closed_sequence: null,
      purged_sequence: expect.toBeNumber(),
    },
  ]);
});

test('it leaves, for the purges no open forget owns, the purge of a record forget that has not ended', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunPurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.finishEvidencePurges({ isUnowned: true });

  const rows = await readPurgeRows(ctx.memory.writer.db);

  expect(rows).toStrictEqual([
    {
      record_sequence: recordSequence,
      item_id: item.itemID,
      closed_sequence: null,
      purged_sequence: null,
    },
  ]);
});

test('it leaves, for the purges no open forget owns, the purge of an erasure of the record that has not finished', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunRecordErasurePurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.finishEvidencePurges({ isUnowned: true });

  const rows = await readPurgeRows(ctx.memory.writer.db);

  expect(rows).toStrictEqual([
    {
      record_sequence: recordSequence,
      item_id: item.itemID,
      closed_sequence: null,
      purged_sequence: null,
    },
  ]);
});

test('it finishes, for the purges no open forget owns, the purge of an erasure of the record that finished', async () => {
  const ctx = await setupTest();
  const recordSequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await seedBegunRecordErasurePurge(ctx.memory.log, { recordSequence, itemIDs: [item.itemID] });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  await writeRecords(ctx.memory.log, [
    {
      kind: erasureFinishedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      payload: erasureFinishedCodec.encode({
        erasureID: `erasure-${String(recordSequence)}`,
        kind: 'record',
        targetID: String(recordSequence),
        shortID: null,
        by: 'user',
        removedKeys: 0,
      }),
    },
  ]);

  await ctx.memory.store.finishEvidencePurges({ isUnowned: true });

  const rows = await readPurgeRows(ctx.memory.writer.db);

  expect(rows).toStrictEqual([
    {
      record_sequence: recordSequence,
      item_id: item.itemID,
      closed_sequence: null,
      purged_sequence: expect.toBeNumber(),
    },
  ]);
});
