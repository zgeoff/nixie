import { expect, test } from 'bun:test';
import { createAllowedAction, runInStepActions } from '@heynixie/actions';
import {
  buildActionSeeder,
  createTestStep,
  readTestAction,
  startTestActions,
} from '@heynixie/actions/test-utils';
import { writeRecords } from '@heynixie/log';
import type { RuleEntry } from '@heynixie/policy';
import { actionProposedCodec, makeDecisionPoint } from '@heynixie/policy';
import type { ApprovedCallRequest, ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, toolCalledCodec } from '@heynixie/tools';
import { buildMockVariantToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { makeAttemptCheck } from './make-attempt-check';

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

  const check = makeAttemptCheck({
    log: actions.context.log,
    clock: actions.clock,
    definitions: actions.context.definitions,
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
          Promise.resolve({ rules, contacts: [], tools: new Map(), ownerDestinations: [] }),
        findTaskDestinations: () => [],
        readConsent: overrides?.readConsent ?? (() => Promise.resolve(null)),
      }),
  });

  return { ...actions, check, rules };
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

  const queued = await createAllowedAction(ctx.context, {
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

  const queued = await createAllowedAction(ctx.context, {
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
