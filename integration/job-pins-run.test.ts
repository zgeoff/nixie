import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { seedConnectionStatus, startGoogleConnections } from '@heynixie/connections/test-utils';
import { createTestCredentials } from '@heynixie/credentials/test-utils';
import { startGmailTools } from '@heynixie/google/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { runJobConnectionStatus } from '@heynixie/server';
import { buildRunSettings, startSandboxRunner } from '@heynixie/sessions';
import {
  buildStubMemory,
  buildStubToolEndpoint,
  runNextStep,
  startTestSessionHost,
} from '@heynixie/sessions/test-utils';
import { seedDefinitionTask, writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import type { ConnectionChoice } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildMockToolDefinition, withTestToolClient } from '@heynixie/tools/test-utils';
import { triggersProjections } from '@heynixie/triggers';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2027-03-08T21:15:00.000Z') });

  const models = modelsConfigSchema.parse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://models.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
      },
      errands: {
        harness: 'agent-sdk',
        base_url: 'https://models.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-errands',
        effort: 'low',
        context_tokens: 200_000,
        prices: { input: 0, cache_write: 0, cache_write_1h: 0, cached_input: 0, output: 0 },
      },
    },
    roles: { conversation: 'chat-direct', task: 'errands' },
  });

  const credentials = await createTestCredentials({
    model_credentials: { anthropic: 'not-a-real-key' },
  });

  const host = await startTestSessionHost({
    clock,
    projections: triggersProjections,
    runSettings: buildRunSettings({ models, credentials, hopLimit: 20, logger: () => {} }),
  });

  const connected = await startGoogleConnections({
    sharedLog: { log: host.context.log, dataDir: host.dataDir },
  });

  for (const code of ['code-work', 'code-home']) {
    const finished = await connected.connect(code);

    invariant(finished.kind === 'finished', 'the consent finishes');
  }

  const [work, home] = await connected.readRows();

  invariant(work && home, 'both connections are stored');

  const gmail = await startGmailTools();

  gmail.site.addConnection(work.short_id, { isPolled: false });
  gmail.site.addConnection(home.short_id, { isPolled: false });

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
    gmail.findAction('gmail.search').tool,
  ]);

  // the live connections as the server reads them, from the connections module
  const readLiveConnections = async (): Promise<ConnectionChoice[]> => {
    const listed = await connected.connections.list();

    return listed.flatMap((entry) =>
      entry.status === 'forgotten'
        ? []
        : [
            {
              connection: entry.connection,
              label: entry.label ?? entry.connector,
              account: entry.account ?? '',
            },
          ],
    );
  };

  const endpoint = await startToolEndpoint({
    logger: () => {},
    socketDir: join(host.dataDir, 'run-tools'),
    registry,
    decide: readStarterDecisionPoint(
      (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    ),
    log: host.context.log,
    readLiveConnections,
    definitions: host.context.definitions,
    queue: {
      enqueue: () => Promise.resolve({ status: 'queued', actionID: 'action-1' }),
      readOpenRepeat: () => Promise.resolve(null),
      readOpenAsk: () => Promise.resolve(null),
      waitForOutcome: () => Promise.resolve(null),
    },
  });

  onTestFinished(() => endpoint.stop());

  const stubTools = buildStubToolEndpoint();

  const runner = await startSandboxRunner({
    context: host.context,
    models,
    credentials,
    sandboxes: host.sandboxes,
    images: { conversation: 'nixie-conversation-0123456789ab' },
    tools: stubTools.endpoint,
    memory: () => buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } }),
    getDefinitions: () => ({
      persona: 'You are Pip.',
      prompts: {},
      personaHash: 'sha256:persona-test',
      policyHash: 'sha256:policy-test',
    }),
    memorySettings: { rebuildTokens: 30_000, ownerName: 'Robin', agentNames: [] },
    memoryReadTools: [],
    compaction: { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 },
    defaultZone: 'Australia/Sydney',
    readConnectionStatus: (pinned, timeZone) =>
      runJobConnectionStatus(connected.connections, pinned, timeZone),
    messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: 'Robin', agentName: null },
    clearFetchPauses: () => {},
    log: () => {},
  });

  host.defer(() => runner.stop());

  let fires = 0;

  // what the model of the run gets from the endpoint, with the pins the runner handed it
  const withHandedRun = <Result>(
    use: (client: Parameters<Parameters<typeof withTestToolClient>[1]>[0]) => Promise<Result>,
  ) => {
    const index = stubTools.runs.length - 1;
    const handed = stubTools.runs[index];

    invariant(handed, 'the runner started the run');

    return endpoint
      .startRun({
        runID: `handed-${String(crypto.randomUUID())}`,
        toolUseMetaKey: null,
        thread: handed.thread,
        logThread: handed.logThread,
        tools: [...handed.tools],
        ...(handed.connectionPins === undefined ? {} : { connectionPins: handed.connectionPins }),
        model: { model: 'claude-test-errands', profile: 'errands' },
      })
      .then((run) => {
        const step = run.startStep('step-fire');

        return withTestToolClient({ target: run.target, token: step.token }, use);
      });
  };

  return {
    ...host,
    connected,
    work,
    home,
    endpoint,
    runs: stubTools.runs,

    // a saved definition of one job pinned to the connections, and a fire of it that the runner runs
    writeJob: (pins: Readonly<Record<string, readonly string[]>>) =>
      seedDefinitionTask(
        { ...host, writer: host.context.log.writer },
        {
          definitionID: 'water-the-tomatoes',
          definitionHash: 'hash-1',
          version: { tools: ['tasks.list', 'gmail.search'], connections: pins },
        },
      ),
    runFire: async (taskID: string) => {
      fires += 1;

      await writeTestTriggerFire(host.context, taskID, {
        definitionHash: 'hash-1',
        dedupeKey: `water-the-tomatoes:fire-${String(fires)}`,
      });

      await runNextStep(host.context, runner.runStep);
    },

    readHandedTools: async () => {
      const listed = await withHandedRun((client) => client.listTools());

      return JSON.stringify(listed);
    },

    withHandedRun,
  };
}

test('it fails a call of a job run to a connection outside the pins its saved definition handed the run', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.writeJob({ 'gmail.search': [ctx.work.short_id] });

  await ctx.runFire(taskID);

  const calls = await ctx.withHandedRun(async (client) => {
    const outside = await client.callTool({
      name: 'gmail.search',
      arguments: { query: 'tide', connection: ctx.home.short_id },
    });

    const inside = await client.callTool({
      name: 'gmail.search',
      arguments: { query: 'tide', connection: ctx.work.short_id },
    });

    return [outside, inside] as const;
  });

  const [outside, inside] = calls;

  expect([outside.isError, JSON.stringify(outside.content), inside.isError === true]).toStrictEqual(
    [true, expect.stringContaining('NOT_PINNED'), false],
  );
});

test('it gives the model the system prompt and the tool list byte for byte when a pinned connection needs consent, and tells it in the first input', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeJob({
    'gmail.search': [ctx.work.short_id, ctx.home.short_id],
  });

  await ctx.runFire(taskID);

  const listWorking = await ctx.readHandedTools();

  await seedConnectionStatus(ctx.connected, ctx.work.connection_id, { status: 'needs_consent' });

  await ctx.runFire(taskID);

  const listBroken = await ctx.readHandedTools();

  const [working, broken] = ctx.guest.turns;

  invariant(working && broken, 'each fire ran a turn');

  const inputOf = (turn: typeof working) => turn.input.map((message) => message.text).join('\n');

  expect([
    broken.systemPrompt,
    listBroken,
    inputOf(working).includes('needs consent'),
    inputOf(broken).includes('needs consent'),
  ]).toStrictEqual([working.systemPrompt, listWorking, false, true]);
});
