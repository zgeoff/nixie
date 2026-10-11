import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { startTestServer } from './start-test-server';

test('it starts a log with the tasks and sandboxes projections, an endpoint and the process double', async () => {
  const server = await startTestServer();

  expect(server.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
    'sandboxes',
  ]);
  expect(server.sandboxes).toMatchObject({ id: 'process', boundary: 'process' });
  expect(server.endpoint.getToolTarget({ id: 's-1', owner: 'conversation' })).toMatchObject({
    path: expect.toStartWith(server.dataDir),
  });
});

test('it removes the data directory when the test finishes', async () => {
  const server = await startTestServer();

  onTestFinished(() => {
    expect(stat(server.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(server.dataDir).toBeString();
});
