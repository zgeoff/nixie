import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildTaskDefineTool, readDefinitionVersion } from '@heynixie/definitions';
import { buildTestDefineInput, startTestDefinitions } from '@heynixie/definitions/test-utils';
import { startGmailTools } from '@heynixie/google/test-utils';
import { parseJSONObject, readRecords } from '@heynixie/log';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { createConversationTask, planSandboxStart } from '@heynixie/tasks';
import { buildMockTaskStartBounds } from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { ConnectionChoice, ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import {
  buildMockToolCall,
  buildMockToolContext,
  buildMockToolDefinition,
  withTestToolClient,
} from '@heynixie/tools/test-utils';
import { buildScheduleSource, deliverTriggerBatch } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { z } from 'zod';

interface DefineChoice extends Omit<
  NonNullable<Parameters<typeof buildTestDefineInput>[0]>,
  'connections'
> {
  // the short IDs that task.define takes, which it turns into pins
  readonly connections?: readonly string[];
}

async function setupTest() {
  const ctx = await startTestDefinitions();

  ctx.clock.advance(Date.parse('2027-03-08T00:00:00Z') - ctx.clock.now());

  const zone = { readZone: () => Promise.resolve('UTC') };

  const gmail = await startGmailTools();

  gmail.site.addConnection('p8d2v6n4rc', { isPolled: false });

  // The accounts that the job's endpoint and the connections of the conversation see, as the server
  // reads them: a connection added or forgotten here is added or forgotten on the fake account too.
  const accounts: ConnectionChoice[] = [
    { connection: 'k3x9m2p7qa', label: 'Work', account: 'work@example.test' },
    { connection: 'p8d2v6n4rc', label: 'Home', account: 'home@example.test' },
  ];

  const readUsable = () =>
    Promise.resolve({
      'time.now': accounts.map((entry) => entry.connection),
      'gmail.search': accounts.map((entry) => entry.connection),
    });

  const define = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    connections: { readUsable },
    ...zone,
  });

  const standIn: ToolDefinition = buildMockToolDefinition({
    name: 'time.now',
    execution: 'direct',
    input: { properties: { connection: { type: 'string' } } },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { text: 'owner_data' },
    },
  });

  const search = gmail.findAction('gmail.search').tool;

  const registry = buildToolRegistry([
    ...['tasks.list', 'task.message', 'task.report'].map((name) =>
      buildMockToolDefinition({
        name,
        execution: 'direct',
        declaration: {
          effects: ['read'],
          destinations: [],
          amount: null,
          content: [],
          results: { text: 'owner_data' },
        },
      }),
    ),
    standIn,
    search,
  ]);

  const endpoint = await startToolEndpoint({
    logger: () => {},
    socketDir: join(ctx.root, '..', 'run-tools'),
    registry,
    decide: readStarterDecisionPoint(
      (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    ),
    log: ctx.log,
    readLiveConnections: () => Promise.resolve([...accounts]),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: {
      enqueue: () => Promise.resolve({ status: 'queued', actionID: 'action-1' }),
      readOpenRepeat: () => Promise.resolve(null),
      readOpenAsk: () => Promise.resolve(null),
      waitForOutcome: () => Promise.resolve(null),
    },
  });

  onTestFinished(() => endpoint.stop());

  return {
    ...ctx,
    accounts,
    startConversation: () => createConversationTask(ctx.tasks),

    // The conversation connects a third account while it waits for an approval, or after the job
    // was defined.
    addAccount: (connection: string) => {
      accounts.push({ connection, label: 'New', account: 'new@example.test' });
      gmail.site.addConnection(connection, { isPolled: false });
    },
    forgetAccount: (connection: string) => {
      accounts.splice(
        accounts.findIndex((entry) => entry.connection === connection),
        1,
      );

      gmail.site.forget(`${connection}-id`);
    },

    // what the model passes task.define, after the endpoint resolved it for the decision point
    resolveDefine: (input: DefineChoice) => {
      const given = { ...buildTestDefineInput({ tools: ['time.now'] }), ...input };

      return define.resolveInput?.(parseJSONObject(JSON.stringify(given)), {
        run: buildMockToolContext().run,
      });
    },

    // what the endpoint does with a task.define: it resolves the call's connections, then runs it
    runDefine: async (input: DefineChoice) => {
      const given = parseJSONObject(
        JSON.stringify({ ...buildTestDefineInput({ tools: ['time.now'] }), ...input }),
      );

      invariant(define.resolveInput, 'task.define resolves its connections');

      const resolved = await define.resolveInput(given, { run: buildMockToolContext().run });

      invariant(resolved.status === 'ok', 'the define names connections the conversation may use');

      const call = buildMockToolCall({ tool: 'task.define', input: resolved.input });

      return define.run(call, buildMockToolContext());
    },
    readFiredVersion: async () => {
      const [fired] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

      const hash = z.string().parse(fired?.record.payload['definitionHash']);

      return readDefinitionVersion(ctx.writer.db, hash);
    },

    // The sandbox runner starts a definition's task run endpoint on the version's tools and pins,
    // and the guest offers the model what the endpoint lists.
    withRun: async <Result>(
      tools: readonly string[],
      connectionPins: Readonly<Record<string, readonly string[]>>,
      use: (client: Parameters<Parameters<typeof withTestToolClient>[1]>[0]) => Promise<Result>,
    ) => {
      const run = await endpoint.startRun({
        runID: `run-${String(crypto.randomUUID())}`,
        toolUseMetaKey: null,
        thread: 'run-fire',
        logThread: 'run-fire',
        tools: [...tools],
        connectionPins,
        model: { model: 'claude-test-errands', profile: 'errands' },
      });

      const step = run.startStep('step-fire');

      return withTestToolClient({ target: run.target, token: step.token }, use);
    },
    runFireAt: async (instant: string) => {
      const controller = new AbortController();

      const source = buildScheduleSource({
        db: ctx.writer.db,
        clock: ctx.clock,
        readZone: zone.readZone,
        readLastMessageAt: () => Promise.resolve(null),
      });

      onTestFinished(async () => {
        controller.abort();

        await source.stop();
      });

      await source.start({
        cursor: null,
        deliver: (batch) => deliverTriggerBatch(ctx.core, 'schedule', batch),
        reportHealth: () => {},
        signal: controller.signal,
      });

      await waitForCondition(() => ctx.clock.countPending() === 1);

      ctx.clock.advance(Date.parse(instant) - ctx.clock.now());

      await waitForCondition(async () => {
        const fired = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

        return fired.length === 1;
      });
    },
  };
}

test('it pins each connector tool of a definition from chat to every connection the conversation may use when the call names none', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({});
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  expect(version?.connections).toStrictEqual({ 'time.now': ['k3x9m2p7qa', 'p8d2v6n4rc'] });
});

test('it pins a definition from chat to the connections the call named, and never to a later one', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({ connections: ['k3x9m2p7qa'] });

  ctx.addAccount('z1z1z1z1z1');

  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  expect(version?.connections).toStrictEqual({ 'time.now': ['k3x9m2p7qa'] });
});

test('it never pins a job to an account that connects while the approval card is open', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();

  const resolved = await ctx.resolveDefine({});

  ctx.addAccount('z1z1z1z1z1');

  const approved = resolved?.status === 'ok' ? resolved.input : {};

  await ctx.runDefine(approved);
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  expect(version?.connections).toStrictEqual({ 'time.now': ['k3x9m2p7qa', 'p8d2v6n4rc'] });
});

test('it refuses a definition from chat that names a connection the conversation may not use before any approval, and stores none', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();

  const refused = await ctx.resolveDefine({ connections: ['zzzzzzzzzz'] });
  const changed = await readRecords(ctx.log, { afterSequence: 0, kinds: ['definition.changed'] });

  expect([refused, changed]).toStrictEqual([
    {
      status: 'error',
      message: 'You cannot use zzzzzzzzzz, so the task cannot be pinned to it.',
    },
    [],
  ]);
});

test('it lists a pinned job run the pinned connections of its tool, with their labels, and never an account added later', async () => {
  const ctx = await setupTest();

  ctx.addAccount('z1z1z1z1z1');

  const listed = await ctx.withRun(
    ['time.now'],
    { 'time.now': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
    async (client) => {
      const found = await client.listTools();

      return found.tools[0]?.inputSchema.properties?.['connection'];
    },
  );

  expect(listed).toStrictEqual({
    oneOf: [
      { const: 'k3x9m2p7qa', description: 'Work: work@example.test' },
      { const: 'p8d2v6n4rc', description: 'Home: home@example.test' },
    ],
  });
});

test('it lists a pinned job run its tool without the connection argument once only one pinned connection lives', async () => {
  const ctx = await setupTest();

  ctx.forgetAccount('p8d2v6n4rc');

  const listed = await ctx.withRun(
    ['time.now'],
    { 'time.now': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
    async (client) => {
      const found = await client.listTools();

      return Object.keys(found.tools[0]?.inputSchema.properties ?? {});
    },
  );

  expect(listed).not.toContain('connection');
});

test('it lists a pinned job run no connector tool once every connection its version pins is forgotten', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({ connections: ['k3x9m2p7qa'] });
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  invariant(version, 'the fired version is stored');

  ctx.forgetAccount('k3x9m2p7qa');

  const offered = await ctx.withRun(version.tools, version.connections, async (client) => {
    const found = await client.listTools();

    return found.tools.map((tool) => tool.name);
  });

  expect(offered).toStrictEqual(['tasks.list', 'task.message', 'task.report']);
});

test('it fails a Google call of a pinned job run to a connection outside its pins, even for an account added after the job was defined', async () => {
  const ctx = await setupTest();

  ctx.addAccount('z1z1z1z1z1');

  const calls = await ctx.withRun(
    ['gmail.search'],
    { 'gmail.search': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
    async (client) => {
      const outside = await client.callTool({
        name: 'gmail.search',
        arguments: { query: 'tide', connection: 'z1z1z1z1z1' },
      });

      const inside = await client.callTool({
        name: 'gmail.search',
        arguments: { query: 'tide', connection: 'p8d2v6n4rc' },
      });

      return [outside, inside] as const;
    },
  );

  const [outside, inside] = calls;

  expect([outside.isError, JSON.stringify(outside.content), inside.isError === true]).toStrictEqual(
    [true, expect.stringContaining('NOT_PINNED'), false],
  );
});

test('it keeps the pins of a job run that began before its definition was edited to a wider set', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({ connections: ['k3x9m2p7qa'], tools: ['time.now'] });
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const first = await ctx.readFiredVersion();

  invariant(first, 'the fired version is stored');

  ctx.addAccount('z1z1z1z1z1');

  await ctx.runDefine({
    definitionID: 'water-the-tomatoes',
    connections: ['k3x9m2p7qa', 'z1z1z1z1z1'],
  });

  const outside = await ctx.withRun(
    ['gmail.search'],
    { 'gmail.search': first.connections['time.now'] ?? [] },
    (client) =>
      client.callTool({
        name: 'gmail.search',
        arguments: { query: 'tide', connection: 'z1z1z1z1z1' },
      }),
  );

  expect(outside.isError).toBe(true);
});

test('it refuses a child task of a pinned job an account outside the pins of the job', async () => {
  const ctx = await setupTest();

  const plan = planSandboxStart(
    { name: 'Tide check', brief: 'Check the tides.', tools: ['gmail.search'] },
    {
      tools: ['tasks.list', 'task.message', 'time.now', 'gmail.search'],
      memory: 'none',
      persona: 'default',
      log: 'own',
      connectionPins: { 'gmail.search': ['k3x9m2p7qa'] },
    },
    buildMockTaskStartBounds(),
  );

  invariant(plan.status === 'planned', 'the start is planned');

  const options = plan.options;

  const outside = await ctx.withRun(options.tools, options.connectionPins ?? {}, (client) =>
    client.callTool({
      name: 'gmail.search',
      arguments: { query: 'tide', connection: 'p8d2v6n4rc' },
    }),
  );

  expect([outside.isError, JSON.stringify(outside.content)]).toStrictEqual([
    true,
    expect.stringContaining('NOT_PINNED'),
  ]);
});
