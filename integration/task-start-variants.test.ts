import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import type { TaskRunnerDefinition } from '@heynixie/tasks';
import {
  buildStepRunID,
  buildTaskRunnerRegistry,
  buildTaskStartTool,
  conversationRunner,
  defineRunnerStart,
  readTaskSetup,
  sandboxRunner,
} from '@heynixie/tasks';
import {
  buildMockTaskStartBounds,
  buildTaskSeeder,
  startTestTasks,
} from '@heynixie/tasks/test-utils';
import { buildToolRegistry, findToolDeclaration, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  const tasks = await startTestTasks();
  const step = await buildTaskSeeder({ context: tasks.context }).conversationStep();

  const watcher: TaskRunnerDefinition = {
    key: 'watcher',
    controls: ['pause', 'stop'],
    start: defineRunnerStart({
      schema: z.strictObject({
        runner: z.literal('watcher'),
        name: z.string(),
        brief: z.string(),
        target: z.string(),
      }),
      describeInput: () => ({
        type: 'object',
        properties: {
          runner: { type: 'string', const: 'watcher' },
          name: { type: 'string' },
          brief: { type: 'string' },
          target: { type: 'string' },
        },
        required: ['runner', 'name', 'brief', 'target'],
        additionalProperties: false,
      }),
      declaration: {
        effects: ['note'],
        destinations: [],
        amount: null,
        content: ['name', 'brief'],
        results: { taskID: 'owner_data', name: 'owner_data', note: 'owner_data' },
      },
      storesBuiltOptions: false,
      plan: (start) =>
        start.target === ''
          ? { status: 'refused', sentence: 'a watcher needs a target, so nixie started nothing' }
          : {
              status: 'planned',
              envelope: { report: 'next_turn', limits: { turns: 3, dollars: 1 } },
              options: { target: start.target },
            },
      encodeOptions: (options) => options,
    }),
    fixedTasks: [],
    keepsSandboxes: false,
  };

  const context = {
    ...tasks.context,
    runners: buildTaskRunnerRegistry({
      definitions: [conversationRunner, sandboxRunner, watcher],
      defaultRunner: sandboxRunner,
    }),
  };

  const tool = buildTaskStartTool(
    context,
    { hopLimit: 20, ownerName: null },
    buildMockTaskStartBounds(),
  );

  const registry = buildToolRegistry([tool]);

  return {
    tool,
    context,
    callStart: (input: Record<string, string>, rules: readonly { id: string; tools: string[] }[]) =>
      runToolCall(
        { tool: 'task.start', input, toolUseID: null },
        {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: ['tasks.list', 'task.message', 'task.start', 'time.now'],
          stepRunID: buildStepRunID(step.claim),
          model: { model: 'model-a', profile: 'chat-direct' },
        },
        {
          registry,
          decide: readStarterDecisionPoint((name) => findToolDeclaration(registry, name), {
            extraRules: rules.map((rule) => ({
              id: rule.id,
              revision: 1,
              rule: { id: rule.id, outcome: 'ask', tools: rule.tools },
            })),
          }),
          log: context.log,
          definitions: context.definitions,
          queue: {
            enqueue: () => Promise.reject(new Error('task.start runs direct')),
            readOpenRepeat: () => Promise.resolve(null),
            waitForOutcome: () => Promise.resolve(null),
          },
          queuedWaitMs: 1000,
        },
      ),
    readCreated: async () => {
      const entries = await readRecords(context.log, {
        afterSequence: 0,
        kinds: ['task.created'],
      });

      return entries
        .map((entry) => entry.record.payload)
        .filter((payload) => payload['startedBy'] !== undefined);
    },
    readProposals: () =>
      readRecords(context.log, { afterSequence: 0, kinds: ['policy.action_proposed'] }),
  };
}

test('it adds the variant of a second runner to the input of the tool, beside the default one', async () => {
  const ctx = await setupTest();

  expect([
    ctx.tool.input['oneOf'],
    Object.keys(ctx.tool.variants?.declarations ?? {}),
  ]).toStrictEqual([
    [expect.toBeObject(), expect.toBeObject()],
    ['sandbox', 'watcher'],
  ]);
});

test('it starts the default runner for an input with no runner', async () => {
  const ctx = await setupTest();
  const result = await ctx.callStart({ name: 'Garden plan', brief: 'Plan the beds.' }, []);
  const [created] = await ctx.readCreated();

  expect(result.isError).toBeUndefined();

  expect(created).toStrictEqual(
    expect.objectContaining({ runner: 'sandbox', options: expect.toBeObject() }),
  );
});

test('it plans a second runner start with its own plan, and writes the envelope and the runner options with no options', async () => {
  const ctx = await setupTest();

  const result = await ctx.callStart(
    { runner: 'watcher', name: 'Night watch', brief: 'Watch the build.', target: 'main' },
    [],
  );

  const [created] = await ctx.readCreated();

  const taskID = created?.['taskID'];

  invariant(typeof taskID === 'string', 'the created record holds a task ID');

  expect(result.isError).toBeUndefined();

  expect(created).toStrictEqual(
    expect.objectContaining({
      runner: 'watcher',
      envelope: { report: 'next_turn', limits: { turns: 3, dollars: 1 } },
      runnerOptions: { target: 'main' },
    }),
  );

  expect(created).not.toHaveProperty('options');

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup).toStrictEqual({
    kind: 'started',
    runner: 'watcher',
    startedBy: 'conversation',
    report: 'next_turn',
    limits: { turns: 3, dollars: 1 },
    options: null,
  });
});

test('it returns the sentence of the plan of a second runner as the error, and writes no task and no proposal', async () => {
  const ctx = await setupTest();

  const result = await ctx.callStart(
    { runner: 'watcher', name: 'Night watch', brief: 'Watch the build.', target: '' },
    [{ id: 'ask-watchers', tools: ['task.start/watcher'] }],
  );

  expect(result).toStrictEqual({
    content: [{ type: 'text', text: 'a watcher needs a target, so nixie started nothing' }],
    isError: true,
  });

  const created = await ctx.readCreated();
  const proposals = await ctx.readProposals();

  expect([created, proposals]).toStrictEqual([[], []]);
});

test('it asks about a start under a rule on the second variant only, and starts nothing until it is approved', async () => {
  const ctx = await setupTest();

  const rules = [{ id: 'ask-watchers', tools: ['task.start/watcher'] }];

  const watched = await ctx.callStart(
    { runner: 'watcher', name: 'Night watch', brief: 'Watch the build.', target: 'main' },
    rules,
  );

  const planned = await ctx.callStart({ name: 'Garden plan', brief: 'Plan the beds.' }, rules);
  const created = await ctx.readCreated();
  const proposals = await ctx.readProposals();

  expect(watched.content).toStrictEqual([
    { type: 'text', text: expect.stringContaining('Waiting for approval as') },
  ]);

  expect(planned.isError).toBeUndefined();
  expect(created.map((payload) => payload['runner'])).toStrictEqual(['sandbox']);

  expect(proposals.map((entry) => entry.record.payload['tool'])).toStrictEqual([
    'task.start/watcher',
  ]);
});

test('it refuses a sandbox start with no persona and memory read before the starter rule can ask, and writes no proposal', async () => {
  const ctx = await setupTest();

  const result = await ctx.callStart(
    { name: 'Garden plan', brief: 'Plan the beds.', persona: 'none', memory: 'read' },
    [],
  );

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: 'a task with persona none cannot read memory, so nixie started nothing',
      },
    ],
    isError: true,
  });

  const created = await ctx.readCreated();
  const proposals = await ctx.readProposals();

  expect([created, proposals]).toStrictEqual([[], []]);
});
