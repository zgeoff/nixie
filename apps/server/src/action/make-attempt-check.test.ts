import { expect, test } from 'bun:test';
import { runInStepActions } from '@heynixie/actions';
import {
  buildActionSeeder,
  createTestStep,
  queueTestAction,
  readTestAction,
  startTestActions,
} from '@heynixie/actions/test-utils';
import { codingActionDeclarations, codingDeclarations } from '@heynixie/coding';
import { parseJSONObject, readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import type { EffectDeclaration, RuleEntry } from '@heynixie/policy';
import { actionProposedCodec, makeDecisionPoint } from '@heynixie/policy';
import { readStarterRules } from '@heynixie/policy/test-utils';
import type { ApprovedCallRequest, ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, toolCalledCodec } from '@heynixie/tools';
import { buildMockVariantToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { makeAttemptCheck } from './make-attempt-check';

interface RunnerActionInput {
  tool: string;
  args: object;
  sequence: number;
  stepKey?: string;
}

async function setupTest() {
  const actions = await startTestActions();

  const tool: ToolDefinition = {
    name: 'notes.post',
    description: 'Posts a note to the shared board.',
    input: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    output: { type: 'object' },
    execution: 'queued',
    declaration: {
      effects: ['send'],
      destinations: [],
      amount: null,
      content: ['text'],
      results: {},
    },
    run: () => Promise.reject(new Error('notes.post runs as an action, never inside the turn')),
  };

  const reader: ToolDefinition = {
    name: 'notes.read',
    description: 'Reads the notes on the shared board.',
    input: { type: 'object', properties: { board: { type: 'string' } }, required: ['board'] },
    output: { type: 'object' },
    execution: 'direct',
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: {},
    },
    run: () => Promise.reject(new Error('the test runs notes.read through its runCall')),
  };

  const rules: RuleEntry[] = [];

  const snapshotTools = new Map<string, EffectDeclaration>();

  const check = makeAttemptCheck({
    log: actions.context.log,
    clock: actions.clock,
    definitions: actions.context.definitions,
    findRunnerDeclaration: (name) => codingActionDeclarations.get(name) ?? null,
    registry: buildToolRegistry([
      tool,
      reader,
      buildMockVariantToolDefinition({
        execution: 'queued',
        declaration: { effects: ['send'] },
        variants: {
          pick: () => 'risky',
          declarations: {
            risky: {
              effects: ['send'],
              destinations: [],
              amount: null,
              content: ['query'],
              results: { text: 'owner_data' },
            },
          },
        },
      }),
    ]),
    decisions: (findDeclaration, overrides) =>
      makeDecisionPoint({
        findDeclaration,
        readInputs: () =>
          Promise.resolve({ rules, contacts: [], tools: snapshotTools, ownerDestinations: [] }),
        findTaskDestinations: () => [],
        readConsent: overrides?.readConsent ?? (() => Promise.resolve(null)),
      }),
  });

  return {
    ...actions,
    check,
    rules,
    snapshotTools,
    queueRunnerAction: async (taskID: string, action: RunnerActionInput) => {
      const queue = actions.context.queueRunnerActions;

      invariant(queue, 'the test actions queue runner actions');

      const [actionID] = await withWriteTransaction(actions.writer, (tx) =>
        queue(tx, {
          taskID,
          stepKey: action.stepKey ?? 'ended:stopped',
          actions: [
            {
              tool: action.tool,
              args: parseJSONObject(JSON.stringify(action.args)),
              hashParts: ['stop'],
              causedBy: { kind: 'record', sequence: action.sequence },
            },
          ],
        }),
      );

      invariant(actionID !== undefined, 'the queue returns the action it wrote');

      return readTestAction(actions.writer, actionID);
    },
    readNewestSequence: async (thread: string) => {
      const [newest] = await readRecords(actions.context.log, {
        afterSequence: 0,
        thread,
        order: 'newest',
        limit: 1,
      });

      invariant(newest, 'the thread holds a record');

      return newest.record.sequence;
    },
  };
}

test('it gives the proposal of an allowed action that no rule now steers the frame of its call, so its answer joins a gap group', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const [called] = await writeRecords(ctx.context.log, [
    {
      kind: toolCalledCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: step.lease.workID,
      payload: toolCalledCodec.encode({
        callID: 'call-1',
        runID: 'run-1',
        toolUseID: 'toolu_1',
        tool: 'notes.post',
        model: 'claude-test-1',
        profile: 'chat-direct',
      }),
      decision: {
        outcome: 'allow',
        stage: 9,
        rule: { id: 'post-notes', revision: 1 },
        inputs: {
          toolList: ['notes.post'],
          context: 'task',
          definitionID: 'board-notes',
          sources: ['task'],
          turnMessageSequence: null,
          onBehalfOf: [],
        },
      },
      erasable: { input: { text: 'Boat is ready' }, destinations: [] },
    },
  ]);

  invariant(called, 'the call is recorded');

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'notes.post',
    actionHash: 'sha256:post-1',
    arguments: { text: 'Boat is ready' },
    decision: { outcome: 'allow', stage: 9, rule: { id: 'post-notes', revision: 1 } },
    callSequence: called.sequence,
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  const verdict = await ctx.check({
    action,
    arguments: { text: 'Boat is ready' },
    proposalID: action.action_id,
  });

  invariant(verdict.kind === 'ask' && verdict.record.payload, 'no rule allows the call now');

  const proposed = actionProposedCodec.decode(verdict.record.payload);

  expect({
    cause: proposed.cause,
    context: proposed.context,
    definitionID: proposed.definitionID,
    sources: proposed.sources,
    groupHash: proposed.groupHash,
  }).toStrictEqual({
    cause: 'no_rule',
    context: 'task',
    definitionID: 'board-notes',
    sources: ['task'],
    groupHash: expect.any(String),
  });
});

test('it denies an allowed variant call when a rule now denies that variant', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const [called] = await writeRecords(ctx.context.log, [
    {
      kind: toolCalledCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: step.lease.workID,
      payload: toolCalledCodec.encode({
        callID: 'call-1',
        runID: 'run-1',
        toolUseID: 'toolu_1',
        tool: 'jobs_start',
        model: 'claude-test-1',
        profile: 'chat-direct',
      }),
      decision: {
        outcome: 'allow',
        stage: 9,
        rule: { id: 'start-jobs', revision: 1 },
        inputs: {
          toolList: ['jobs_start'],
          context: 'task',
          definitionID: 'board-notes',
          sources: ['task'],
          turnMessageSequence: null,
          onBehalfOf: [],
        },
      },
      erasable: { input: { kind: 'risky', query: 'a' }, destinations: [] },
    },
  ]);

  invariant(called, 'the call is recorded');

  ctx.rules.push({
    id: 'deny-risky',
    revision: 1,
    rule: { id: 'deny-risky', outcome: 'deny', tools: ['jobs_start/risky'] },
  });

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'jobs_start',
    actionHash: 'sha256:start-1',
    arguments: { kind: 'risky', query: 'a' },
    decision: { outcome: 'allow', stage: 9, rule: { id: 'start-jobs', revision: 1 } },
    callSequence: called.sequence,
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  const verdict = await ctx.check({
    action,
    arguments: { kind: 'risky', query: 'a' },
    proposalID: action.action_id,
  });

  expect(verdict).toStrictEqual({
    kind: 'deny',
    rule: { id: 'deny-risky', revision: 1 },
    message: 'rule deny-risky (r1)',
  });
});

test('it fails an approved in-step call rule_denied, and runs no call, when a rule added after the approval denies it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const [called] = await writeRecords(ctx.context.log, [
    {
      kind: toolCalledCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: step.lease.workID,
      payload: toolCalledCodec.encode({
        callID: 'call-1',
        runID: 'run-1',
        toolUseID: 'toolu_1',
        tool: 'notes.read',
        model: 'claude-test-1',
        profile: 'chat-direct',
      }),
      decision: {
        outcome: 'ask',
        stage: 9,
        rule: null,
        cause: 'no_rule',
        inputs: {
          toolList: ['notes.read'],
          context: 'task',
          definitionID: 'board-notes',
          sources: ['task'],
          turnMessageSequence: null,
          onBehalfOf: [],
        },
      },
      erasable: { input: { board: 'harbour' }, destinations: [] },
    },
  ]);

  invariant(called, 'the call is recorded');

  const queued = await buildActionSeeder({ context: ctx.context }).inStepAction({
    step,
    tool: 'notes.read',
    callSequence: called.sequence,
    arguments: { board: 'harbour' },
  });

  ctx.rules.push({
    id: 'deny-board-reads',
    revision: 1,
    rule: { id: 'deny-board-reads', outcome: 'deny', tools: ['notes.read'] },
  });

  const calls: ApprovedCallRequest[] = [];

  await runInStepActions(ctx.context, step.lease, {
    checkAttempt: ctx.check,
    runCall: (request) => {
      calls.push(request);

      return Promise.resolve({
        status: 'done',
        resultSequence: called.sequence,
        result: {},
        images: [],
      });
    },
  });

  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'failed', reason: 'rule_denied', attempt_count: 0 });
});

test('it decides a runner action under its own tool with the task as caller, and asks under an ask rule with the record that caused it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  ctx.rules.push(
    {
      id: 'allow-stop-destinations',
      revision: 1,
      rule: {
        id: 'allow-stop-destinations',
        outcome: 'allow',
        tools: ['coding.stop'],
        destinations: ['atc:*'],
      },
    },
    {
      id: 'ask-stop-sessions',
      revision: 1,
      rule: { id: 'ask-stop-sessions', outcome: 'ask', tools: ['coding.stop'] },
    },
  );

  const cause = await ctx.readNewestSequence(step.lease.workID);

  const action = await ctx.queueRunnerAction(step.lease.workID, {
    tool: 'coding.stop',
    args: { session: 'atc:cloud.3f9a1c2e.7c1d0e55', origin: 'started' },
    sequence: cause,
  });

  const verdict = await ctx.check({
    action,
    arguments: { session: 'atc:cloud.3f9a1c2e.7c1d0e55', origin: 'started' },
    proposalID: action.action_id,
  });

  invariant(verdict.kind === 'ask' && verdict.record.payload, 'the stop asks under the ask rule');

  const proposed = actionProposedCodec.decode(verdict.record.payload);

  expect({
    cause: verdict.cause,
    destinations: verdict.destinations,
    parent: verdict.record.parent,
    tool: proposed.tool,
    callSequence: proposed.callSequence,
    proposedCause: proposed.cause,
  }).toStrictEqual({
    cause: 'ask_rule',
    destinations: ['atc:cloud.3f9a1c2e.7c1d0e55'],
    parent: cause,
    tool: 'coding.stop',
    callSequence: cause,
    proposedCause: 'ask_rule',
  });
});

test.each([
  [
    'the stop of a started session',
    'coding.stop',
    { session: 'atc:cloud.3f9a1c2e.1', origin: 'started' },
    ['atc:cloud.3f9a1c2e.1'],
  ],
  [
    'the spawn of a start',
    'coding.spawn',
    { name: 'Login fix', prompt: 'Fix the login test.' },
    [],
  ],
  [
    'a steer of a bound session',
    'coding.steer',
    { session: 'atc:cloud.3f9a1c2e.1', text: 'Check the cookie expiry.' },
    ['atc:cloud.3f9a1c2e.1'],
  ],
  [
    'a note to a bound session',
    'coding.message',
    { session: 'atc:cloud.3f9a1c2e.1', text: 'The cache fix landed.' },
    ['atc:cloud.3f9a1c2e.1'],
  ],
] as const)(
  'it lets %s go ahead under the starter rules',
  async (_label, tool, args, destinations) => {
    const ctx = await setupTest();
    const step = await createTestStep(ctx.context);

    ctx.rules.push(...readStarterRules());

    const action = await ctx.queueRunnerAction(step.lease.workID, {
      tool,
      args,
      sequence: await ctx.readNewestSequence(step.lease.workID),
    });

    const verdict = await ctx.check({
      action,
      arguments: parseJSONObject(JSON.stringify(args)),
      proposalID: action.action_id,
    });

    expect(verdict).toStrictEqual({
      kind: 'go',
      destinations: [...destinations],
      replyTargets: [],
    });
  },
);

test('it denies a runner steer under a send deny rule, even when the snapshot declares the tool that queues it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  ctx.snapshotTools.set('coding.steer', codingDeclarations.steerCall);

  ctx.rules.push(...readStarterRules(), {
    id: 'deny-sends',
    revision: 1,
    rule: { id: 'deny-sends', outcome: 'deny', effects: ['send'] },
  });

  const cause = await ctx.readNewestSequence(step.lease.workID);

  const action = await ctx.queueRunnerAction(step.lease.workID, {
    tool: 'coding.steer',
    args: { session: 'atc:cloud.3f9a1c2e.1', text: 'Go on.' },
    sequence: cause,
  });

  const verdict = await ctx.check({
    action,
    arguments: { session: 'atc:cloud.3f9a1c2e.1', text: 'Go on.' },
    proposalID: action.action_id,
  });

  expect(verdict).toMatchObject({ kind: 'deny', rule: { id: 'deny-sends' } });
});

test('it holds a steer that a step queued at the destination limits, when an allow rule that names no destination covers it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  ctx.rules.push({
    id: 'allow-steers',
    revision: 1,
    rule: { id: 'allow-steers', outcome: 'allow', tools: ['coding.steer'] },
  });

  const action = await ctx.queueRunnerAction(step.lease.workID, {
    tool: 'coding.steer',
    args: { session: 'atc:cloud.3f9a1c2e.1', text: 'Check the cookie expiry.' },
    sequence: await ctx.readNewestSequence(step.lease.workID),
    stepKey: `${step.lease.workID}:2`,
  });

  const verdict = await ctx.check({
    action,
    arguments: { session: 'atc:cloud.3f9a1c2e.1', text: 'Check the cookie expiry.' },
    proposalID: action.action_id,
  });

  invariant(verdict.kind === 'ask' && verdict.record.payload, 'the steer asks');

  expect(actionProposedCodec.decode(verdict.record.payload).cause).toBe('outside_steering');
});
