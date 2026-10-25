import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildToolRegistry } from '../build-tool-registry';
import { startToolEndpoint } from '../start-tool-endpoint';
import { buildMockToolDefinition } from './build-mock-tool-definition';
import { readTestToolNames } from './read-test-tool-names';
import { setupTestLog } from './setup-test-log';

async function setupTest() {
  const testLog = await setupTestLog();

  return { dataDir: testLog.dataDir, log: testLog.log };
}

test('it reads the names of the tools a run endpoint offers to the run token', async () => {
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

  const names = await readTestToolNames({ target: run.target, token: run.token });

  expect(names).toStrictEqual(['notes_read']);
});
