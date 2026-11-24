import { expect, mock, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import type { LogFields, LogLevel } from '@heynixie/logger';
import { buildActionHash } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry } from './build-tool-registry';
import { startToolEndpoint } from './start-tool-endpoint';
import { buildMockToolDefinition } from './test-utils/build-mock-tool-definition';
import { setupTestLog } from './test-utils/setup-test-log';
import { startRunClient } from './test-utils/start-run-client';
import type { ToolContext, ToolDefinition } from './types';

interface SetupConfig {
  readonly tools: readonly ToolDefinition[];
}

async function setupTest(config: SetupConfig) {
  const testLog = await setupTestLog();

  const registry = buildToolRegistry(config.tools);

  const logLines: { event: string; fields: LogFields | undefined; level: LogLevel | undefined }[] =
    [];

  const endpoint = await startToolEndpoint({
    logger: (event, fields, level) => {
      logLines.push({ event, fields, level });
    },
    socketDir: join(testLog.dataDir, 'tools'),
    registry,
    decide: readStarterDecisionPoint(
      (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    ),
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    queue: {
      enqueue: mock(),
      readOpenRepeat: mock(() => Promise.resolve(null)),
      readOpenAsk: mock(() => Promise.resolve(null)),
      waitForOutcome: mock(),
    },
  });

  onTestFinished(() => endpoint.stop());

  return { endpoint, log: testLog.log, dataDir: testLog.dataDir, logLines };
}

test('it lists and runs a tool that the run names by its SDK name under the registered name', async () => {
  const ctx = await setupTest({
    tools: [buildMockToolDefinition({ name: 'notes.read' })],
  });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['mcp__nixie__notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const client = await startRunClient(run);
  const listed = await client.listTools();
  const result = await client.callTool({ name: 'notes.read', arguments: { query: 'milk' } });

  expect(listed.tools.map((tool) => tool.name)).toStrictEqual(['notes.read']);
  expect(result.structuredContent).toStrictEqual({ text: 'a note' });
});

test('it warns once for each tool of a run that no registered tool answers', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes.read' })] });

  await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes.read', 'mcp__nixie__pond_drain', 'kettle.boil'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  expect(ctx.logLines).toStrictEqual([
    {
      event: 'tools.run_tool_unknown',
      fields: { runID: 'run-1', tool: 'mcp__nixie__pond_drain' },
      level: 'warn',
    },
    {
      event: 'tools.run_tool_unknown',
      fields: { runID: 'run-1', tool: 'kettle.boil' },
      level: 'warn',
    },
  ]);
});

test("it lists only the run's tools, each with its name, description and input schema alone", async () => {
  const ctx = await setupTest({
    tools: [
      buildMockToolDefinition({ name: 'notes_read', description: 'Read one of your notes.' }),
      buildMockToolDefinition({ name: 'notes_search', description: 'Search your notes.' }),
    ],
  });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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

  expect(entries[0]?.record.decision).toMatchObject({ outcome: 'deny', stage: 2, rule: null });
});

test("it records the tool-use ID that the call carries under the run's _meta key", async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    toolUseMetaKey: 'example/toolUseId',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const client = await startRunClient(run);

  await client.callTool({
    name: 'notes_read',
    arguments: { query: 'milk' },
    _meta: { 'example/toolUseId': 'toolu_b44b20cd', 'claudecode/toolUseId': 'toolu_c55c31de' },
  });

  const entries = await readRecords(ctx.log, { afterSequence: 0 });

  expect(
    entries.map((entry) => [entry.record.kind, entry.record.payload['toolUseID']]),
  ).toStrictEqual([
    ['tool_called', 'toolu_b44b20cd'],
    ['tool_result', 'toolu_b44b20cd'],
  ]);
});

test('it records no tool-use ID for a run whose guest sends none', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    runID: 'run-1',
    toolUseMetaKey: null,
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const client = await startRunClient(run);

  await client.callTool({
    name: 'notes_read',
    arguments: { query: 'milk' },
    _meta: { 'example/toolUseId': 'toolu_b44b20cd', 'claudecode/toolUseId': 'toolu_c55c31de' },
  });

  const entries = await readRecords(ctx.log, { afterSequence: 0 });

  expect(
    entries.map((entry) => [entry.record.kind, entry.record.payload['toolUseID']]),
  ).toStrictEqual([
    ['tool_called', null],
    ['tool_result', null],
  ]);
});

test('it returns a typed result to the client as structured content with no text block', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const client = await startRunClient(run);
  const result = await client.callTool({ name: 'notes_read', arguments: { query: 'milk' } });

  expect(result).toMatchObject({ content: [], structuredContent: { text: 'a note' } });
});

test('it refuses a request with no bearer token', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const runA = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-a',
    thread: 'task-a',
    logThread: 'task-a',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const runB = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-b',
    thread: 'task-b',
    logThread: 'task-b',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const ended = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  await ended.stop();

  const restarted = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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

test('it hands each call the run identity of the step whose token the call carries', async () => {
  const run = mock(() => Promise.resolve({ status: 'ok' as const, result: { text: 'a note' } }));

  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read', run })] });

  const endpoint = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const step = endpoint.startStep('task-1:3@2');

  const client = await startRunClient(endpoint, step.token);

  await client.callTool({ name: 'notes_read', arguments: { query: 'milk' } });

  expect(run).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    run: {
      runID: 'run-1',
      thread: 'task-1',
      logThread: 'task-1',
      tools: ['notes_read'],
      model: { model: 'model-a', profile: 'chat-direct' },
      stepRunID: 'task-1:3@2',
    },
    callSequence: expect.toBePositive(),
  });
});

test('it hands each call the session its step token names', async () => {
  const run = mock(() => Promise.resolve({ status: 'ok' as const, result: { text: 'a note' } }));

  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read', run })] });

  const endpoint = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const step = endpoint.startStep('task-1:3@2', { key: 'session-a', invalidatedThrough: 12 });

  const client = await startRunClient(endpoint, step.token);

  await client.callTool({ name: 'notes_read', arguments: { query: 'milk' } });

  expect(run).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    run: {
      runID: 'run-1',
      thread: 'task-1',
      logThread: 'task-1',
      tools: ['notes_read'],
      model: { model: 'model-a', profile: 'chat-direct' },
      stepRunID: 'task-1:3@2',
      session: { key: 'session-a', invalidatedThrough: 12 },
    },
    callSequence: expect.toBePositive(),
  });
});

test('it hands a call under the run token no step run identity', async () => {
  const run = mock(() => Promise.resolve({ status: 'ok' as const, result: { text: 'a note' } }));

  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read', run })] });

  const endpoint = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  endpoint.startStep('task-1:3@2');

  const client = await startRunClient(endpoint);

  await client.callTool({ name: 'notes_read', arguments: { query: 'milk' } });

  expect(run).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    run: {
      runID: 'run-1',
      thread: 'task-1',
      logThread: 'task-1',
      tools: ['notes_read'],
      model: { model: 'model-a', profile: 'chat-direct' },
    },
    callSequence: expect.toBePositive(),
  });
});

test('it refuses a step token once its step stops', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const endpoint = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const step = endpoint.startStep('task-1:3@2');

  await step.stop();

  const response = await Bun.fetch('http://localhost/mcp', {
    method: 'POST',
    unix: endpoint.socketPath,
    headers: { authorization: `Bearer ${step.token}`, 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(401);
});

test('it keeps the run token when a step stops', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const endpoint = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const step = endpoint.startStep('task-1:3@2');

  await step.stop();

  const client = await startRunClient(endpoint);
  const listed = await client.listTools();

  expect(listed).toMatchObject({ tools: [{ name: 'notes_read' }] });
});

test("it keeps another step's token when one step stops", async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const endpoint = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const stopped = endpoint.startStep('task-1:3@2');
  const running = endpoint.startStep('task-1:3@3');

  await stopped.stop();

  const client = await startRunClient(endpoint, running.token);
  const listed = await client.listTools();

  expect(listed).toMatchObject({ tools: [{ name: 'notes_read' }] });
});

test('it stops listening on the run socket when the run ends', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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

test('it refuses a second endpoint for a run that has one', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  expect(
    ctx.endpoint.startRun({
      toolUseMetaKey: null,
      runID: 'run-1',
      thread: 'task-1',
      logThread: 'task-1',
      tools: ['notes_read'],
      model: { model: 'model-a', profile: 'chat-direct' },
    }),
  ).rejects.toThrowWithMessage(Error, 'the run run-1 already has a tool endpoint');
});

test("it leaves a later writer's socket for the same run in place when its run stops", async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const registry = buildToolRegistry([buildMockToolDefinition({ name: 'notes_read' })]);

  const other = await startToolEndpoint({
    logger: () => {},
    socketDir: join(ctx.dataDir, 'tools'),
    registry,
    decide: readStarterDecisionPoint(
      (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    ),
    log: { ...ctx.log, writer: { ...ctx.log.writer, epoch: ctx.log.writer.epoch + 1 } },
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    queue: {
      enqueue: mock(),
      readOpenRepeat: mock(() => Promise.resolve(null)),
      readOpenAsk: mock(() => Promise.resolve(null)),
      waitForOutcome: mock(),
    },
  });

  onTestFinished(() => other.stop());

  const stale = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'conversation',
    thread: 'conversation',
    logThread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const live = await other.startRun({
    toolUseMetaKey: null,
    runID: 'conversation',
    thread: 'conversation',
    logThread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  await stale.stop();

  const response = await Bun.fetch('http://localhost/mcp', {
    method: 'POST',
    unix: live.socketPath,
    headers: { authorization: `Bearer ${live.token}`, 'content-type': 'application/json' },
    body: '{}',
  });

  expect(response.status).toBe(400);
});

test('it gives a sandbox the socket of the run that owns it', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  expect(ctx.endpoint.getToolTarget({ id: 'nixie-0123', owner: 'run-1' })).toStrictEqual(
    run.target,
  );
});

test('it gives the sandbox of a worker run the socket of the tool run that takes the worker run UUID', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: '0d9c6a52-3f5e-4b6a-9a52-2f0f4f2b7c11',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  expect(
    ctx.endpoint.getToolTarget({
      id: 'nixie-0123',
      owner: 'worker_run:0d9c6a52-3f5e-4b6a-9a52-2f0f4f2b7c11',
    }),
  ).toStrictEqual(run.target);
});

test('it records each call of a tool run that names a parent under that parent', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const caller = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const callerClient = await startRunClient(caller);

  await callerClient.callTool({ name: 'notes_read', arguments: { query: 'a' } });

  const [parent] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['tool_called'] });

  const worker = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-2',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-b', profile: 'worker' },
    parent: parent?.record.sequence ?? 0,
  });

  const workerClient = await startRunClient(worker);

  await workerClient.callTool({ name: 'notes_read', arguments: { query: 'b' } });

  const called = await readRecords(ctx.log, { afterSequence: 0, kinds: ['tool_called'] });

  expect(called.map((entry) => entry.record.parent)).toStrictEqual([
    null,
    parent?.record.sequence ?? 0,
  ]);
});

test('it gives a sandbox the socket of a run that another endpoint of the same writer owns', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const registry = buildToolRegistry([buildMockToolDefinition({ name: 'notes_read' })]);

  const other = await startToolEndpoint({
    logger: () => {},
    socketDir: join(ctx.dataDir, 'tools'),
    registry,
    decide: readStarterDecisionPoint(
      (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    ),
    log: ctx.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),

    queue: {
      enqueue: mock(),
      readOpenRepeat: mock(() => Promise.resolve(null)),
      readOpenAsk: mock(() => Promise.resolve(null)),
      waitForOutcome: mock(),
    },
  });

  onTestFinished(() => other.stop());

  const run = await other.startRun({
    toolUseMetaKey: null,
    runID: 'sweeper',
    thread: 'sweeper',
    logThread: 'sweeper',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  expect(ctx.endpoint.getToolTarget({ id: 'nixie-0123', owner: 'sweeper' })).toStrictEqual(
    run.target,
  );
});

test('it sends the listen acknowledgement while the listen stream stays open', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_read' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'model-a', profile: 'chat-direct' },
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

  const first = await response.body?.pipeThrough(new TextDecoderStream()).getReader().read();

  expect(first?.done).toBeFalse();
  expect(first?.value).toInclude('notifications/subscriptions/acknowledged');
});

test("it runs an approved call under the session and the step run of the token's step", async () => {
  const contexts: ToolContext[] = [];

  const ctx = await setupTest({
    tools: [
      buildMockToolDefinition({
        name: 'notes_wipe',
        declaration: { effects: ['export'] },
        run: (_call, context) => {
          contexts.push(context);

          return Promise.resolve({ status: 'ok', result: { text: 'wiped' } });
        },
      }),
    ],
  });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_wipe'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const session = { key: 'session-a', invalidatedThrough: 4 };
  const step = run.startStep('task-1@1', session);

  const client = await startRunClient(run, step.token);

  await client.callTool({ name: 'notes_wipe', arguments: { query: 'old' } });

  const approved = await run.runApproved(step.token, {
    actionID: 'proposal-1',
    tool: 'notes_wipe',
    input: { query: 'old' },
    callSequence: 1,
    actionHash: buildActionHash({
      tool: 'notes_wipe',
      input: { query: 'old' },
      destinations: [],
      deadlineAt: null,
    }),
  });

  expect(approved).toMatchObject({ status: 'done' });

  expect(contexts.map((context) => [context.run.stepRunID, context.run.session])).toStrictEqual([
    ['task-1@1', session],
  ]);
});

test('it refuses an approved call under the token of a step that stopped', async () => {
  const ctx = await setupTest({ tools: [buildMockToolDefinition({ name: 'notes_wipe' })] });

  const run = await ctx.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'run-1',
    thread: 'task-1',
    logThread: 'task-1',
    tools: ['notes_wipe'],
    model: { model: 'model-a', profile: 'chat-direct' },
  });

  const step = run.startStep('task-1@1');

  await step.stop();

  await expect(
    run.runApproved(step.token, {
      actionID: 'proposal-1',
      tool: 'notes_wipe',
      input: { query: 'old' },
      callSequence: 1,
      actionHash: 'sha256:any',
    }),
  ).rejects.toBeInstanceOf(Error);
});
