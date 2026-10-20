import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { threadsProjection } from '@heynixie/log';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import invariant from 'tiny-invariant';
import { startTestSessionHost } from './start-test-session-host';

test('it starts a log with the tasks and sandboxes projections, and the process double', async () => {
  const host = await startTestSessionHost();

  expect(host.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
    'sandboxes',
  ]);

  expect(host.sandboxes).toMatchObject({ id: 'process', boundary: 'process' });
});

test('it folds the projections it is given after its own', async () => {
  const host = await startTestSessionHost({
    projections: [{ ...threadsProjection, table: 'notes' }],
  });

  expect(host.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
    'sandboxes',
    'notes',
  ]);
});

test('it records each sandbox the process double creates in the log', async () => {
  const host = await startTestSessionHost();

  const sandbox = await host.sandboxes.create(
    buildMockSandboxSpec({ kind: 'worker', image: 'worker', owner: 'task-1' }),
  );

  host.defer(() => sandbox.destroy());

  const rows = await host.context.log.writer.db
    .$extendTables<{ sandboxes: { sandbox_id: string; owner: string } }>()
    .selectFrom('sandboxes')
    .select(['sandbox_id', 'owner'])
    .execute();

  expect(rows).toStrictEqual([{ sandbox_id: sandbox.id, owner: 'task-1' }]);
});

test('it destroys each sandbox it created when the test finishes, so its tool relay closes', async () => {
  const host = await startTestSessionHost();

  const sandbox = await host.sandboxes.create(
    buildMockSandboxSpec({ kind: 'worker', image: 'worker', owner: 'task-1' }),
  );

  const route = await sandbox.toolRoute();

  invariant(route);

  const port = Number(new URL(route.url).port);

  onTestFinished(async () => {
    await expect(
      Bun.connect({ hostname: '127.0.0.1', port, socket: { data: () => {} } }),
    ).toReject();
  });

  const socket = await Bun.connect({ hostname: '127.0.0.1', port, socket: { data: () => {} } });

  const connectedPort = socket.remotePort;

  socket.end();

  expect(connectedPort).toBe(port);
});

test('it stops a deferred part while the log is still open', async () => {
  const host = await startTestSessionHost();

  const seen: { count: number | null } = { count: null };

  host.defer(async () => {
    const rows = await host.context.log.writer.db
      .$extendTables<{ tasks: { task_id: string } }>()
      .selectFrom('tasks')
      .select('task_id')
      .execute();

    seen.count = rows.length;
  });

  onTestFinished(() => {
    expect(seen.count).toBe(0);
  });

  expect(host.defer).toBeFunction();
});

test('it removes the data directory when the test finishes', async () => {
  const host = await startTestSessionHost();

  onTestFinished(() => {
    expect(stat(host.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(host.socketDir).toStartWith(host.dataDir);
});
