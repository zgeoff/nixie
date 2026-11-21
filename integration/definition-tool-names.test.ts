import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { buildTaskDefineTool, readDefinitionVersion } from '@heynixie/definitions';
import { seedTaskVersions, startTestDefinitions } from '@heynixie/definitions/test-utils';
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
  const define = buildTaskDefineTool({ readDefinitions: () => ctx.context, ...zone });

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
    runDefine: (input: object) => {
      const call = buildMockToolCall({
        tool: 'task.define',
        input: parseJSONObject(JSON.stringify(input)),
      });

      return define.run(call, buildMockToolContext());
    },
    readFiredHash: async () => {
      const [fired] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

      return z.string().parse(fired?.record.payload['definitionHash']);
    },
    readVersion: (hash: string) => readDefinitionVersion(ctx.writer.db, hash),

    // The sandbox runner starts a definition's task run endpoint on the version's tools, and the
    // guest offers the model what the endpoint lists.
    readRunTools: async (tools: readonly string[]) => {
      const run = await endpoint.startRun({
        runID: 'run-fire',
        toolUseMetaKey: null,
        thread: 'run-fire',
        logThread: 'run-fire',
        tools: [...tools],
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

test.each([
  ['the tools it lists as nixie names them', ['tasks.list', 'time.now']],
  [
    'the tools it lists as the tool list shows them',
    ['mcp__nixie__tasks_list', 'mcp__nixie__time_now'],
  ],
  ['the base tools beside the one tool it lists', ['mcp__nixie__time_now']],
])('it offers the scheduled task run of a definition from chat %s', async (_form, tools) => {
  const ctx = await setupTest();

  await ctx.seed();

  await createConversationTask(ctx.tasks);

  const defined = await ctx.runDefine({
    name: 'Check the tide times',
    brief: 'Read the tide table and report the next high tide.',
    trigger: {
      schedule: { repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'] }, zone: 'owner' },
    },
    tools,
  });

  invariant(defined.status === 'ok', 'task.define accepted the definition');

  await ctx.runFireAt('2027-03-12T08:01:00Z');

  const hash = await ctx.readFiredHash();
  const version = await ctx.readVersion(hash);

  invariant(version, 'the fired version is stored');

  const offered = await ctx.readRunTools(version.tools);

  expect(offered).toStrictEqual(['tasks.list', 'task.message', 'task.report', 'time.now']);
});

test('it offers the task run of a version stored with SDK tool names the tools it lists', async () => {
  const ctx = await setupTest();

  const [seeded] = await seedTaskVersions(ctx.writer, [
    {
      definitionID: 'check-the-tide-times',
      name: 'Check the tide times',
      brief: 'Read the tide table and report the next high tide.',
      tools: ['mcp__nixie__tasks_list', 'mcp__nixie__time_now'],
    },
  ]);

  invariant(seeded, 'the version is stored');

  const version = await ctx.readVersion(seeded.definitionHash);

  invariant(version, 'the version reads back');

  const offered = await ctx.readRunTools(version.tools);

  expect(offered).toStrictEqual(['tasks.list', 'task.message', 'task.report', 'time.now']);
});
