import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildToolRegistry } from '../build-tool-registry';
import { startToolEndpoint } from '../start-tool-endpoint';
import { buildMockToolDefinition } from './build-mock-tool-definition';
import { setupTestLog } from './setup-test-log';
import { withTestToolClient } from './with-test-tool-client';

async function setupTest() {
  const testLog = await setupTestLog();

  return { dataDir: testLog.dataDir, log: testLog.log };
}

test('it runs the callback with a client connected to the run endpoint and returns its result', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry([
    buildMockToolDefinition({ name: 'notes_read' }),
    buildMockToolDefinition({ name: 'notes_search' }),
  ]);

  const endpoint = await startToolEndpoint({
    socketDir: join(ctx.dataDir, 'tools'),
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    }),
    log: ctx.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    queue: { enqueue: mock(), waitForOutcome: mock() },
  });

  onTestFinished(() => endpoint.stop());

  const run = await endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const result = await withTestToolClient(
    { target: run.target, token: run.token },
    async (client) => {
      const listed = await client.listTools();

      return listed.tools.map((tool) => tool.name);
    },
  );

  expect(result).toStrictEqual(['notes_read']);
});

test('it rejects a target that is not a Unix socket and never runs the callback', () => {
  const run = mock(() => Promise.resolve(null));

  expect(
    withTestToolClient({ target: { host: '127.0.0.1', port: 8901 }, token: 'token' }, run),
  ).rejects.toThrow('the test endpoint listens on a Unix socket');

  expect(run).not.toHaveBeenCalled();
});
