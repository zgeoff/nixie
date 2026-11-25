import type { ActionAttemptOptions } from '@heynixie/actions';
import { claimAction, makeQueueRunnerActions, runActionAttempt } from '@heynixie/actions';
import { startTestActions } from '@heynixie/actions/test-utils';
import type { Log } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { RunStep, StartedClaim, TaskRunnerDefinition, TasksContext } from '@heynixie/tasks';
import {
  buildStepRunID,
  buildTaskRunnerRegistry,
  buildTaskStartTool,
  claimTask,
  conversationRunner,
  createConversationTask,
  runTaskStep,
  sandboxRunner,
} from '@heynixie/tasks';
import { buildMockTaskStartBounds, createTestConversationClaim } from '@heynixie/tasks/test-utils';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import type { TriggerCoreContext } from '@heynixie/triggers';
import { triggersProjections } from '@heynixie/triggers';
import { buildTestTriggerCore } from '@heynixie/triggers/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildCodingConnectors } from '../connector/build-coding-connectors';
import { codingProjections } from '../projection/coding-projections';
import { buildCodingRunner } from '../runner/build-coding-runner';
import { buildCodingTools } from '../tool/build-coding-tools';
import type { CodingContext, CodingSettings } from '../types';
import type { FakeCodingAdapter } from './build-fake-coding-adapter';
import { buildFakeCodingAdapter } from './build-fake-coding-adapter';

export interface TestCoding {
  readonly clock: FakeClock;
  readonly log: Log;

  // the tasks context, whose registry holds the coding runner beside the conversation's and the
  // sandbox's
  readonly context: TasksContext;
  readonly coding: CodingContext;
  readonly core: TriggerCoreContext;
  readonly adapter: FakeCodingAdapter;
  readonly definition: TaskRunnerDefinition;
  readonly tools: ReadonlyMap<string, ToolDefinition>;

  // each event that the coding module logged
  readonly logged: { readonly event: string; readonly fields: unknown }[];

  // runs the steps of every claimable task until none is left: each coding task on the coding
  // runner's step, and every other task on the step given, which answers nothing by default
  readonly runSteps: (otherStep?: RunStep) => Promise<number>;

  // runs every action attempt that is due, with the coding connectors, until none is left
  readonly runActions: (options?: Partial<ActionAttemptOptions>) => Promise<number>;

  // a step of the conversation that holds its lease, as a turn that calls tools does
  readonly claimConversation: () => Promise<StartedClaim>;

  // calls task.start or a coding tool from the conversation's step, with a call ID of its own
  readonly callTool: (
    claim: StartedClaim,
    tool: string,
    input: object,
  ) => Promise<{ readonly callID: string; readonly outcome: ToolOutcome }>;

  // calls task.start from the conversation's step, and returns the ID of the task it started
  readonly startTask: (claim: StartedClaim, input: object) => Promise<string>;
}

const startedTaskSchema = z.object({ taskID: z.string() });

const testSettings: CodingSettings = {
  wake: {
    started: ['waiting', 'idle', 'blocked', 'decision', 'ended', 'gone'],
    joined: ['waiting', 'ended', 'gone'],
  },
  targets: [
    { daemon: 'laptop', target: 'local' },
    { daemon: 'cloud', target: 'cloud' },
  ],
  defaultTarget: { daemon: 'cloud', target: 'cloud' },
  toolWaitMs: 0,
};

const maxRuns = 50;

// A tasks and actions log that folds the trigger and coding records too, with a conversation task
// and a coding runner on a fake adapter.
export async function startTestCoding(): Promise<TestCoding> {
  const base = await startTestActions();

  const log: Log = {
    ...base.context.log,
    projections: [...base.context.log.projections, ...triggersProjections, ...codingProjections],
  };

  const adapter = buildFakeCodingAdapter();
  const logged: { event: string; fields: unknown }[] = [];
  const definitions = base.context.definitions;

  const tasksWithoutRunners: TasksContext = {
    ...base.context,
    log,
    queueRunnerActions: makeQueueRunnerActions({ log, clock: base.clock, definitions }),
  };

  const coding: CodingContext = {
    tasks: tasksWithoutRunners,
    settings: testSettings,
    ownerName: 'the user',
    logEvent: (event, fields) => {
      logged.push({ event, fields });
    },
  };

  const runner = buildCodingRunner(coding, adapter);

  const context: TasksContext = {
    ...tasksWithoutRunners,
    runners: buildTaskRunnerRegistry({
      definitions: [conversationRunner, sandboxRunner, runner.definition],
      defaultRunner: sandboxRunner,
    }),
  };

  const connectors = buildCodingConnectors(adapter);

  await createConversationTask(context);

  const codingTools = buildCodingTools({ ...coding, tasks: context }, adapter);

  const startTool = buildTaskStartTool(
    context,
    { hopLimit: context.runSettings.hopLimit, ownerName: null },
    buildMockTaskStartBounds(),
  );

  const toolsByName = new Map([...codingTools, startTool].map((tool) => [tool.name, tool]));

  const callTool: TestCoding['callTool'] = async (claim, name, input) => {
    const tool = toolsByName.get(name);

    if (tool === undefined) {
      throw new Error(`the test holds no tool ${name}`);
    }

    const call = buildMockToolCall({ tool: name, input: parseJSONObject(JSON.stringify(input)) });

    const outcome = await tool.run(
      call,
      buildMockToolContext({
        run: { thread: 'conversation', stepRunID: buildStepRunID(claim), tools: [name] },
      }),
    );

    return { callID: call.callID, outcome };
  };

  return {
    clock: base.clock,
    log,
    context,
    coding: { ...coding, tasks: context },
    core: buildTestTriggerCore(context),
    adapter,
    definition: runner.definition,
    tools: toolsByName,
    logged,
    runSteps: async (otherStep) => {
      const fallback: RunStep =
        otherStep ??
        ((input) =>
          Promise.resolve({
            next: 'wait',
            records: [],
            acknowledged: input.inbox.map((record) => record.sequence),
          }));

      const step = context.runners.bindSteps(
        context,
        [
          { definition: conversationRunner, runStep: fallback },
          { definition: sandboxRunner, runStep: fallback },
          { definition: runner.definition, runStep: runner.runStep },
        ],
        fallback,
      );

      for (let runs = 0; runs < maxRuns; runs += 1) {
        const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000 });

        if (claim === null) {
          return runs;
        }

        await runTaskStep(context, claim, {
          runStep: step,
          leaseMs: 60_000,
          logger: () => {},
          maxStepErrors: 3,
          retryDelayMs: 30_000,
          maxRetryDelayMs: 300_000,
        });
      }

      throw new Error(`the tasks ran ${String(maxRuns)} steps and still had work`);
    },
    runActions: async (options = {}) => {
      for (let runs = 0; runs < maxRuns; runs += 1) {
        const lease = await claimAction(context, { holder: 'actions-a', leaseMs: 60_000 });

        if (lease === null) {
          return runs;
        }

        await runActionAttempt(context, lease, { connectors, leaseMs: 60_000, ...options });
      }

      throw new Error(`the actions ran ${String(maxRuns)} attempts and still had work`);
    },
    claimConversation: () => createTestConversationClaim(context, 'Fix the flaky login test.'),
    callTool,
    startTask: async (claim, input) => {
      const started = await callTool(claim, 'task.start', input);

      invariant(started.outcome.status === 'ok', 'the test expected task.start to succeed');

      return startedTaskSchema.parse(started.outcome.result).taskID;
    },
  };
}
