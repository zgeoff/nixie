import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { startTestServer } from './start-test-server';

test('it starts a log with the tasks, sandboxes and memory projections, an endpoint and the process double', async () => {
  const server = await startTestServer();

  expect(server.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
    'sandboxes',
    'memory_items',
    'memory_versions',
    'memory_writer',
    'memory_proposals',
    'memory_proposal_merges',
    'memory_notice_entries',
    'memory_forgotten_evidence',
    'memory_consolidations',
    'memory_consolidation_changes',
  ]);

  expect(server.sandboxes).toMatchObject({ id: 'process', boundary: 'process' });

  expect(server.endpoint.getToolTarget({ id: 's-1', owner: 'conversation' })).toMatchObject({
    path: expect.toStartWith(server.dataDir),
  });
});

test('it stops a deferred part while the log is still open', async () => {
  const server = await startTestServer();

  const seen: { count: number | null } = { count: null };

  server.defer(async () => {
    const rows = await server.context.log.writer.db
      .$extendTables<{ tasks: { task_id: string } }>()
      .selectFrom('tasks')
      .select('task_id')
      .execute();

    seen.count = rows.length;
  });

  onTestFinished(() => {
    expect(seen.count).toBe(0);
  });

  expect(server.defer).toBeFunction();
});

test('it removes the data directory when the test finishes', async () => {
  const server = await startTestServer();

  onTestFinished(() => {
    expect(stat(server.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(server.dataDir).toBeString();
});

test('it reads the ID of each sandbox the process double holds', async () => {
  const server = await startTestServer();

  const sandbox = await server.sandboxes.create(
    buildMockSandboxSpec({ kind: 'worker', image: 'worker', owner: 'task-1' }),
  );

  server.defer(() => sandbox.destroy());

  const ids = await server.readSandboxIDs();

  expect(ids).toStrictEqual([sandbox.id]);
});
