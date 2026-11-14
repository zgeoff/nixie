import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readAllRemovedSequences } from './read-all-removed-sequences';
import { recordForgetStartedCodec } from './record-forget-started-codec';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads every sequence that a forget start names', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.memory.log,
    [3, 9].map((recordSequence) => ({
      kind: recordForgetStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: recordForgetStartedCodec.encode({ recordSequence }),
    })),
  );

  const removed = await readAllRemovedSequences(ctx.memory.writer.db);

  expect([...removed].toSorted((left, right) => left - right)).toStrictEqual([3, 9]);
});
