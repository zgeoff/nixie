import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestMemory } from './start-test-memory';
import { writeModelReplyRecord } from './write-model-reply-record';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes a reply of the model with its text in the erasable fields', async () => {
  const ctx = await setupTest();

  const sequence = await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The ferry leaves at 8 tomorrow',
  });

  const [entry] = await readRecords(ctx.memory.log, { afterSequence: sequence - 1, limit: 1 });

  expect(entry?.record).toMatchObject({
    sequence,
    kind: 'model.reply',
    thread: 'conversation',
    erasable: { status: 'readable', fields: { text: 'The ferry leaves at 8 tomorrow' } },
  });
});
