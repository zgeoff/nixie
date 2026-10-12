import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { clientHeaderName } from '@heynixie/contract';
import { writeRecords } from '@heynixie/log';
import { startTestAPI } from './start-test-api';

test('it serves the API on a loopback port', async () => {
  const ctx = await startTestAPI();

  const response = await fetch(`${ctx.url}/rpc/sessions/list`, {
    method: 'POST',
    headers: { [clientHeaderName]: 'test', 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(401);
});

test('it starts with the conversation task and the test clock', async () => {
  const ctx = await startTestAPI();

  const tasks = await ctx.writer.db
    .$extendTables<{ tasks: { task_id: string } }>()
    .selectFrom('tasks')
    .select('task_id')
    .execute();

  expect(tasks).toStrictEqual([{ task_id: 'conversation' }]);
  expect(ctx.clock.now()).toBe(1_000_000);
});

test("it folds the memory writer's records into its row", async () => {
  const ctx = await startTestAPI();

  await writeRecords(ctx.context.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 3, at: 1_000_000 },
    },
  ]);

  const row = await ctx.writer.db
    .$extendTables<{ memory_writer: { writer_id: string; start_sequence: number } }>()
    .selectFrom('memory_writer')
    .select(['writer_id', 'start_sequence'])
    .executeTakeFirst();

  expect(row).toStrictEqual({ writer_id: 'memory-writer', start_sequence: 3 });
});

test('it stops the server and removes the data directory once the test finishes', async () => {
  const ctx = await startTestAPI();

  onTestFinished(() => {
    expect(existsSync(ctx.dataDir)).toBeFalse();
    expect(fetch(`${ctx.url}/rpc/sessions/list`)).rejects.toThrow();
  });
});
