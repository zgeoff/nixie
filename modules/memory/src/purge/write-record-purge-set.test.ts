import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { writeRecordPurgeSet } from './write-record-purge-set';

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
    writeSet: (recordSequence: number) =>
      withWriteTransaction(memory.log.writer, (tx) =>
        writeRecordPurgeSet(
          tx,
          { log: memory.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
          recordSequence,
        ),
      ),
    readStarted: async () => {
      const entries = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: ['memory.evidence_purge_started'],
      });

      return entries.map((entry) => entry.record.payload);
    },
  };
}

test('it writes the items that quote the record as the purge set', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await ctx.writeSet(sequence);

  const started = await ctx.readStarted();

  expect(started).toStrictEqual([{ recordSequence: sequence, itemIDs: [item.itemID] }]);
});

test('it writes nothing for a record that no item quotes', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  await ctx.writeSet(sequence);

  const started = await ctx.readStarted();

  expect(started).toStrictEqual([]);
});

test('it writes nothing when the record has a purge set already', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeMessage('I keep bees on the allotment.');

  await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  await ctx.writeSet(sequence);
  await ctx.writeSet(sequence);

  const started = await ctx.readStarted();

  expect(started).toHaveLength(1);
});
