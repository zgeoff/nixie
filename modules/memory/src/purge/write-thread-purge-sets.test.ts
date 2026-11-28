import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { writeThreadPurgeSets } from './write-thread-purge-sets';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    writeMessage: (thread: string, text: string) =>
      writeOwnerMessageRecord(memory.log, {
        thread,
        text,
        spans: [{ start: 0, end: text.length, source: 'typed' }],
      }),
    writeSets: (thread: string) =>
      withWriteTransaction(memory.log.writer, (tx) =>
        writeThreadPurgeSets(
          tx,
          { log: memory.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
          thread,
        ),
      ),
  };
}

test('it answers the purge set of each record of the thread that an item quotes', async () => {
  const ctx = await setupTest();
  const first = await ctx.writeMessage('conversation', 'I keep bees on the allotment.');
  const second = await ctx.writeMessage('conversation', 'I play the oboe on Fridays.');

  const bees = await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: first, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const oboe = await ctx.memory.store.remember({
    text: 'Plays the oboe',
    evidence: { recordSequence: second, start: 0, end: 10 },
    evidenceQuote: 'I play the',
    provenance: buildMockProvenance(),
  });

  const purges = await ctx.writeSets('conversation');

  expect(purges).toStrictEqual([
    { recordSequence: first, itemIDs: [bees.itemID] },
    { recordSequence: second, itemIDs: [oboe.itemID] },
  ]);
});

test('it leaves out an item that quotes a record of another thread', async () => {
  const ctx = await setupTest();
  const other = await ctx.writeMessage('side-task', 'I keep bees on the allotment.');

  await ctx.memory.store.remember({
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: other, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
    provenance: buildMockProvenance(),
  });

  const purges = await ctx.writeSets('conversation');

  expect(purges).toStrictEqual([]);
});
