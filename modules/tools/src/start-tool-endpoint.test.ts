import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildToolRegistry } from './build-tool-registry';
import { startToolEndpoint } from './start-tool-endpoint';
import { buildMockToolDefinition } from './test-utils/build-mock-tool-definition';
import { setupTestLog } from './test-utils/setup-test-log';
import { startRunClient } from './test-utils/start-run-client';
import type { ToolDefinition } from './types';

interface SetupConfig {
  readonly tools: readonly ToolDefinition[];
}

async function setupTest(config: SetupConfig) {
  const testLog = await setupTestLog();
  const registry = buildToolRegistry(config.tools);
  const endpoint = await startToolEndpoint({
    socketDir: join(testLog.dataDir, 'tools'),
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    }),
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    // these tests call direct tools only, so nothing reaches the queue
    queue: { enqueue: mock(), waitForOutcome: mock() },
  });

  onTestFinished(() => endpoint.stop());

  return { endpoint, log: testLog.log };
}

test("it lists only the run's tools, each with its name, description and input schema alone", async () => {
  const ctx = await setupTest({
    tools: [
      buildMockToolDefinition({ name: 'notes_read', description: 'Read one of your notes.' }),
      buildMockToolDefinition({ name: 'notes_search', description: 'Search your notes.' }),
    ],
  });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });
  const client = await startRunClient(run);

  const listed = await client.listTools();

  expect(listed.tools).toStrictEqual([
    {
      name: 'notes_read',
      description: 'Read one of your notes.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  ]);
});

test('it denies a registered tool missing from the run list at the scope stage when the model calls it directly', async () => {
  const ctx = await setupTest({
    tools: [
      buildMockToolDefinition({ name: 'notes_read' }),
      buildMockToolDefinition({ name: 'notes_search' }),
    ],
  });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });
  const client = await startRunClient(run);

  const result = await client.callTool({ name: 'notes_search', arguments: { query: 'milk' } });
  const entries = await readRecords(ctx.log, { afterSequence: 0 });

  expect(result).toMatchObject({
    content: [
      { type: 'text', text: "denied: The tool notes_search is not on this run's tool list." },
    ],
    isError: true,
  });
  expect(entries[0]?.record.decision).toStrictEqual({ outcome: 'deny', stage: 2, rule: null });
});

test('it records the tool-use ID that the call carries in _meta', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });
  const client = await startRunClient(run);

  await client.callTool({
    name: 'notes_read',
    arguments: { query: 'milk' },
    _meta: { 'claudecode/toolUseId': 'toolu_b44b20cd' },
  });

  const entries = await readRecords(ctx.log, { afterSequence: 0 });

  expect(
    entries.map((entry) => [entry.record.kind, entry.record.payload['toolUseID']]),
  ).toStrictEqual([
    ['tool_called', 'toolu_b44b20cd'],
    ['tool_result', 'toolu_b44b20cd'],
  ]);
});

test('it returns a typed result to the client as structured content with no text block', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });
  const client = await startRunClient(run);

  const result = await client.callTool({ name: 'notes_read', arguments: { query: 'milk' } });

  expect(result).toMatchObject({ content: [], structuredContent: { text: 'a note' } });
});

test('it refuses a request with no bearer token', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition()] });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });

  const response = await Bun.fetch('http://localhost/mcp', {
    method: 'POST',
    unix: run.socketPath,
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(401);
});

test("it refuses another run's token on this run's socket", async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition()] });
  const runA = await ctx.endpoint.startRun({
    runID: 'run-a',
    thread: 'task-a',
    tools: ['notes_read'],
  });
  const runB = await ctx.endpoint.startRun({
    runID: 'run-b',
    thread: 'task-b',
    tools: ['notes_read'],
  });

  const response = await Bun.fetch('http://localhost/mcp', {
    method: 'POST',
    unix: runB.socketPath,
    headers: { authorization: `Bearer ${runA.token}`, 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(401);
});

test('it revokes the run token when the run ends, so a restarted run refuses the old token', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition()] });
  const ended = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });

  await ended.stop();

  const restarted = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });
  const response = await Bun.fetch('http://localhost/mcp', {
    method: 'POST',
    unix: restarted.socketPath,
    headers: { authorization: `Bearer ${ended.token}`, 'content-type': 'application/json' },
    body: '{}',
  });

  expect(restarted.token).not.toBe(ended.token);
  expect(response.status).toBe(401);
});

test('it stops listening on the run socket when the run ends', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition()] });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });

  await run.stop();

  expect(
    Bun.fetch('http://localhost/mcp', {
      method: 'POST',
      unix: run.socketPath,
      headers: { authorization: `Bearer ${run.token}` },
    }),
  ).rejects.toThrow();
});

test('it gives a sandbox the socket of the run that owns it', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition()] });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });

  expect(ctx.endpoint.getToolTarget({ id: 'nixie-0123', owner: 'run-1' })).toStrictEqual(
    run.target,
  );
});

test('it sends the listen acknowledgement while the listen stream stays open', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition()] });
  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    thread: 'task-1',
    tools: ['notes_read'],
  });
  const response = await Bun.fetch('http://localhost/mcp', {
    method: 'POST',
    unix: run.socketPath,
    headers: {
      authorization: `Bearer ${run.token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': 'subscriptions/listen',
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: {
        notifications: { toolsListChanged: true },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'claude-code', version: '2.1.293' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });

  // the endpoint's stop at the test's end closes the stream
  const first = await response.body?.pipeThrough(new TextDecoderStream()).getReader().read();

  expect(first?.done).toBeFalse();
  expect(first?.value).toInclude('notifications/subscriptions/acknowledged');
});
