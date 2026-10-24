import { expect, mock, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { threadsProjection } from '@heynixie/log';
import { makeDecisionPoint } from '@heynixie/policy';
import { buildMockSandboxSpec, runGuestFrame } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { ToolOutcome } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { startTestSessionHost } from './start-test-session-host';

test('it starts a log with the tasks and sandboxes projections, and the stub guest', async () => {
  const host = await startTestSessionHost();

  expect(host.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
    'sandboxes',
  ]);

  expect(host.sandboxes).toBe(host.guest.adapter);
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

test('it records each sandbox the stub guest creates in the log', async () => {
  const host = await startTestSessionHost();

  const sandbox = await host.sandboxes.create(
    buildMockSandboxSpec({ kind: 'worker', image: 'worker', owner: 'task-1' }),
  );

  const rows = await host.context.log.writer.db
    .$extendTables<{ sandboxes: { sandbox_id: string; owner: string } }>()
    .selectFrom('sandboxes')
    .select(['sandbox_id', 'owner'])
    .execute();

  expect(rows).toStrictEqual([{ sandbox_id: sandbox.id, owner: 'task-1' }]);
});

test("it sends a tool call of the stub guest's turn to the run endpoint of the sandbox's owner", async () => {
  const host = await startTestSessionHost();

  const runTool = mock(() =>
    Promise.resolve<ToolOutcome>({ status: 'ok', result: { text: 'Buy oat milk.' } }),
  );

  const registry = buildToolRegistry([
    buildMockToolDefinition({ name: 'notes_read', run: runTool }),
  ]);

  const endpoint = await startToolEndpoint({
    socketDir: host.socketDir,
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
    }),
    log: host.context.log,
    definitions: host.context.definitions,
    queue: { enqueue: mock(), waitForOutcome: mock() },
  });

  onTestFinished(() => endpoint.stop());

  const run = await endpoint.startRun({
    runID: 'task-1',
    thread: 'task-1',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const sandbox = await host.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'task-1' }),
  );

  host.guest.addReplies(
    { toolUse: { name: 'mcp__nixie__notes_read', input: { query: 'milk' } } },
    { text: 'It says oat milk.' },
  );

  await runGuestFrame(sandbox, buildMockTurnFrame({ tools: { token: run.token } }));

  expect(runTool).toHaveBeenCalledOnce();

  expect(host.toolResults).toStrictEqual([
    { name: 'notes_read', result: expect.toInclude('Buy oat milk.') },
  ]);
});

test('it reads the names of the tools a turn of the stub guest is offered', async () => {
  const host = await startTestSessionHost();

  const registry = buildToolRegistry([
    buildMockToolDefinition({ name: 'notes_read' }),
    buildMockToolDefinition({ name: 'notes_search' }),
  ]);

  const endpoint = await startToolEndpoint({
    socketDir: host.socketDir,
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
    }),
    log: host.context.log,
    definitions: host.context.definitions,
    queue: { enqueue: mock(), waitForOutcome: mock() },
  });

  onTestFinished(() => endpoint.stop());

  const run = await endpoint.startRun({
    runID: 'task-1',
    thread: 'task-1',
    tools: ['notes_search'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const sandbox = await host.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', owner: 'task-1' }),
  );

  const gate = Promise.withResolvers<void>();

  host.guest.addReplies({ text: 'Found it.', gate: () => gate.promise });

  const turn = runGuestFrame(sandbox, buildMockTurnFrame({ tools: { token: run.token } }));

  await waitForCondition(() => host.guest.received.length === 1);

  const [received] = host.guest.received;

  invariant(received);

  const names = await host.readToolNames(received);

  gate.resolve();

  await turn;

  expect(names).toStrictEqual(['notes_search']);
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
