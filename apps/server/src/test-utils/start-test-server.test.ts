import { expect, mock, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { writeRecords } from '@heynixie/log';
import type { DecisionPoint } from '@heynixie/policy';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { BuildTestServerTools } from './start-test-server';
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

test('it serves the tools it is given, and passes each call through the decision point it is given', async () => {
  const decide = mock<DecisionPoint>(() => ({
    decision: { outcome: 'deny', stage: 3, rule: null },
    sentence: 'Notes are closed today.',
  }));

  const server = await startTestServer({
    definitions: [
      {
        name: 'notes_read',
        description: 'Reads the note you kept last.',
        input: { type: 'object', properties: {}, additionalProperties: false },
        output: { type: 'object', properties: {}, additionalProperties: false },
        declaration: {
          effects: ['read'],
          destinations: [],
          amount: null,
          content: [],
          results: {},
        },
        execution: 'direct',
        run: () => Promise.resolve({ status: 'ok', result: {} }),
      },
    ],
    decide,
  });

  const run = await server.endpoint.startRun({
    runID: 'run-1',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const client = new Client(
    { name: 'nixie-test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (url, init) => Bun.fetch(url, { ...init, unix: run.socketPath }),
      requestInit: { headers: { authorization: `Bearer ${run.token}` } },
    }),
  );

  onTestFinished(() => client.close());

  await client.callTool({ name: 'notes_read', arguments: {} });

  const records = await server.readRecords();

  expect(decide).toHaveBeenCalledWith({ tool: 'notes_read', toolList: ['notes_read'] });

  expect(records.find((record) => record.kind === 'tool_called')?.decision).toMatchObject({
    outcome: 'deny',
  });
});

test('it builds its tools from its own context, the log the tools write to included', async () => {
  const buildTools = mock<BuildTestServerTools>(() => ({
    definitions: [],
    decide: () => ({
      decision: { outcome: 'deny', stage: 1, rule: null },
      sentence: 'No tool is registered.',
    }),
  }));

  const server = await startTestServer(buildTools);

  expect(buildTools).toHaveBeenCalledExactlyOnceWith(server.context);
});

test('it reads the records of its log, oldest first', async () => {
  const server = await startTestServer();

  await writeRecords(server.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
    { kind: 'model.reply', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const records = await server.readRecords();

  expect(records.map((record) => record.kind)).toStrictEqual(['owner_message', 'model.reply']);
});

test('it records your typed messages on a thread and returns their sequences', async () => {
  const server = await startTestServer();
  const sequences = await server.writeOwnerMessages('garden', ['Water the beans', 'Stake them']);
  const records = await server.readRecords();

  expect(records.map((record) => record.sequence)).toStrictEqual([...sequences]);

  expect(
    records.map((record) => ({
      kind: record.kind,
      thread: record.thread,
      erasable: record.erasable,
    })),
  ).toStrictEqual([
    {
      kind: 'owner_message',
      thread: 'garden',
      erasable: {
        status: 'readable',
        fields: { text: 'Water the beans', spans: [{ start: 0, end: 15, source: 'typed' }] },
      },
    },
    {
      kind: 'owner_message',
      thread: 'garden',
      erasable: {
        status: 'readable',
        fields: { text: 'Stake them', spans: [{ start: 0, end: 10, source: 'typed' }] },
      },
    },
  ]);
});
