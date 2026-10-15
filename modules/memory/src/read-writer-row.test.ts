import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readWriterRow } from './read-writer-row';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads the row the writer start created', async () => {
  const ctx = await setupTest();

  const [started] = await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 7, at: 1_000_000 },
    },
  ]);

  const row = await readWriterRow(ctx.memory.log);

  invariant(started);

  expect(row).toStrictEqual({
    writer_id: 'memory-writer',
    cursor: 0,
    start_sequence: 7,
    caught_up_sequence: null,
    catch_up_applied: 0,
    pending_start: null,
    pending_end: null,
    batches: 0,
    last_batch_at: null,
    failures: 0,
    retry_at: null,
    last_error_code: null,
    last_error_sequence: null,
    last_error_at: null,
    updated_sequence: started.sequence,
  });
});

test('it rejects a read before the writer first started', async () => {
  const ctx = await setupTest();

  const read = readWriterRow(ctx.memory.log);

  await read.catch(() => {});

  expect(read).rejects.toThrow();
});
