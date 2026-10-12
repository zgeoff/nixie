import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readWriterRow } from '../read-writer-row';
import { startTestMemory } from './start-test-memory';
import { writePlannedBatch } from './write-planned-batch';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it leaves the writer row waiting on a batch through the last message', async () => {
  const ctx = await setupTest();

  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees.', 'I play the cello.']);
  const row = await readWriterRow(ctx.memory.log);
  const last = planned.sequences.at(-1);

  invariant(last !== undefined);
  expect(planned.bounds).toStrictEqual({ start: 0, end: last });
  expect(row).toMatchObject({ cursor: 0, pending_start: 0, pending_end: last });
});

test('it records each text as your message at the sequence it returns', async () => {
  const ctx = await setupTest();

  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees.', 'I play the cello.']);
  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, thread: 'conversation' });

  expect(entries.map((entry) => entry.record.sequence)).toStrictEqual([...planned.sequences]);
  expect(entries.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { text: 'I keep bees.' } },
    { status: 'readable', fields: { text: 'I play the cello.' } },
  ]);
});

test('it rejects a batch with no message', async () => {
  const ctx = await setupTest();

  const planning = writePlannedBatch(ctx.memory.log, []);

  await planning.catch(() => {});

  expect(planning).rejects.toThrow('a planned batch needs a message');
});
