import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildToolRegistry } from '../build-tool-registry';
import { startToolEndpoint } from '../start-tool-endpoint';
import { buildMockToolDefinition } from './build-mock-tool-definition';
import { sendTestToolCall } from './send-test-tool-call';
import { setupTestLog } from './setup-test-log';

async function setupTest() {
  const testLog = await setupTestLog();

  return { dataDir: testLog.dataDir, log: testLog.log };
}

test('it calls a tool on the run endpoint with the run token and returns its result', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry([
    buildMockToolDefinition({
      name: 'notes_read',
      run: () => Promise.resolve({ status: 'ok', result: { text: 'Buy oat milk.' } }),
    }),
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

  const result = await sendTestToolCall({
    target: run.target,
    token: run.token,
    name: 'notes_read',
    input: { query: 'milk' },
  });

  expect(result).toInclude('Buy oat milk.');
});

test('it rejects a call that carries a token the endpoint does not know', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry([buildMockToolDefinition({ name: 'notes_read' })]);

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

  expect(
    sendTestToolCall({
      target: run.target,
      token: 'not-the-token',
      name: 'notes_read',
      input: { query: 'milk' },
    }),
  ).rejects.toThrow();
});

test('it rejects a target that is not a Unix socket', () => {
  expect(
    sendTestToolCall({
      target: { host: '127.0.0.1', port: 8901 },
      token: 'token',
      name: 'notes_read',
      input: {},
    }),
  ).rejects.toThrow('the test endpoint listens on a Unix socket');
});
