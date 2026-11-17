import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestMemory } from './start-test-memory';
import { writeReplyRecord } from './write-reply-record';

test('it writes a reply on the conversation thread and returns its sequence', async () => {
  const memory = await startTestMemory();
  const sequence = await writeReplyRecord(memory.log, 'Bread is ready.');

  const records = await readRecords(memory.log, {
    afterSequence: 0,
    beforeSequence: sequence + 1,
    thread: 'conversation',
    kinds: ['model.reply'],
    limit: 5,
  });

  expect(records.map((read) => read.record.sequence)).toStrictEqual([sequence]);
});
