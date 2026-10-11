import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { clientHeaderName } from '@heynixie/contract';
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

test('it stops the server and removes the data directory once the test finishes', async () => {
  const ctx = await startTestAPI();

  onTestFinished(() => {
    expect(existsSync(ctx.dataDir)).toBeFalse();
    expect(fetch(`${ctx.url}/rpc/sessions/list`)).rejects.toThrow();
  });
});
