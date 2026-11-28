import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildTaskDefineTool, readDefinitionVersion } from '@heynixie/definitions';
import { startTestDefinitions } from '@heynixie/definitions/test-utils';
import { parseJSONObject, readRecords } from '@heynixie/log';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
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

async function setupTest() {
  const ctx = await startTestDefinitions();

  ctx.clock.advance(Date.parse('2027-03-08T00:00:00Z') - ctx.clock.now());

  const zone = { readZone: () => Promise.resolve('UTC') };

  const define = buildTaskDefineTool({
    readDefinitions: () => ctx.context,
    connections: {
      readUsable: () => Promise.resolve(['k3x9m2p7qa', 'p8d2v6n4rc']),
      connectorTools: ['time.now'],
    },
    ...zone,
  });

  const registry = buildToolRegistry(
    ['tasks.list', 'task.message', 'task.report', 'time.now'].map((name) =>
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
  );

  const endpoint = await startToolEndpoint({
    logger: () => {},
    socketDir: join(ctx.root, '..', 'run-tools'),
    registry,
    decide: readStarterDecisionPoint(
      (tool) => registry.findTool(tool)?.definition.declaration ?? null,
    ),
    log: ctx.log,
    readLiveConnections: () => Promise.resolve(new Set(['p8d2v6n4rc'])),
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
    startConversation: () => createConversationTask(ctx.tasks),
    runDefine: (input: object) => {
      const call = buildMockToolCall({
        tool: 'task.define',
        input: parseJSONObject(
          JSON.stringify({
            name: 'Check the tide times',
            brief: 'Read the tide table and report the next high tide.',
            trigger: {
              schedule: {
                repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] },
                zone: 'owner',
              },
            },
            tools: ['time.now'],
            ...input,
          }),
        ),
      });

      return define.run(call, buildMockToolContext());
    },
    readFiredVersion: async () => {
      const [fired] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

      const hash = z.string().parse(fired?.record.payload['definitionHash']);

      return readDefinitionVersion(ctx.writer.db, hash);
    },

    // The sandbox runner starts a definition's task run endpoint on the version's tools and pins,
    // and the guest offers the model what the endpoint lists.
    readRunTools: async (
      tools: readonly string[],
      connectionPins: Readonly<Record<string, readonly string[]>>,
    ) => {
      const run = await endpoint.startRun({
        runID: 'run-fire',
        toolUseMetaKey: null,
        thread: 'run-fire',
        logThread: 'run-fire',
        tools: [...tools],
        connectionPins,
        model: { model: 'claude-test-errands', profile: 'errands' },
      });

      const step = run.startStep('step-fire');

      return withTestToolClient({ target: run.target, token: step.token }, async (client) => {
        const listed = await client.listTools();

        return listed.tools.map((tool) => tool.name);
      });
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

test('it pins a definition from chat to the connections the call names, and never to a later one', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({ connections: ['k3x9m2p7qa'] });
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  expect(version?.connections).toStrictEqual({ 'time.now': ['k3x9m2p7qa'] });
});

test('it refuses a definition from chat that names a connection the conversation may not use, and stores none', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();

  const refused = await ctx.runDefine({ connections: ['zzzzzzzzzz'] });
  const changed = await readRecords(ctx.log, { afterSequence: 0, kinds: ['definition.changed'] });

  expect([refused, changed]).toStrictEqual([
    {
      status: 'ok',
      result: {
        refused: {
          code: 'connection_not_usable',
          path: 'connections',
          sentence: 'You cannot use zzzzzzzzzz, so the task cannot be pinned to it.',
        },
      },
      refusalCode: 'connection_not_usable',
    },
    [],
  ]);
});

test('it lists a pinned task run no connector tool once every connection its version pins is forgotten', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({ connections: ['k3x9m2p7qa'] });
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  invariant(version, 'the fired version is stored');

  const offered = await ctx.readRunTools(version.tools, version.connections);

  expect(offered).toStrictEqual(['tasks.list', 'task.message', 'task.report']);
});

test('it lists a pinned task run its connector tool while a connection its version pins lives', async () => {
  const ctx = await setupTest();

  await ctx.seed();
  await ctx.startConversation();
  await ctx.runDefine({ connections: ['k3x9m2p7qa', 'p8d2v6n4rc'] });
  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const version = await ctx.readFiredVersion();

  invariant(version, 'the fired version is stored');

  const offered = await ctx.readRunTools(version.tools, version.connections);

  expect(offered).toStrictEqual(['tasks.list', 'task.message', 'task.report', 'time.now']);
});
