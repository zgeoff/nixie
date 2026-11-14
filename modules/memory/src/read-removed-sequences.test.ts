import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readRemovedSequences } from './read-removed-sequences';
import { recordForgetStartedCodec } from './record-forget-started-codec';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads only the sequences that a forget start names', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: recordForgetStartedCodec.encode({ recordSequence: 7 }),
    },
  ]);

  const removed = await readRemovedSequences(ctx.memory.writer.db, [6, 7, 8]);

  expect([...removed]).toStrictEqual([7]);
});

test('it reads no sequence from an empty list', async () => {
  const ctx = await setupTest();
  const removed = await readRemovedSequences(ctx.memory.writer.db, []);

  expect([...removed]).toStrictEqual([]);
});
