import { expect, test } from 'bun:test';
import { createAllowedAction } from '@heynixie/actions';
import { createTestStep, readTestAction, startTestActions } from '@heynixie/actions/test-utils';
import { writeRecords } from '@heynixie/log';
import { actionProposedCodec, makeDecisionPoint } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, toolCalledCodec } from '@heynixie/tools';
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

  const check = makeAttemptCheck({
    log: actions.context.log,
    clock: actions.clock,
    definitions: actions.context.definitions,
    registry: buildToolRegistry([tool]),
    decisions: (findDeclaration, overrides) =>
      makeDecisionPoint({
        findDeclaration,
        readInputs: () =>
          Promise.resolve({ rules: [], contacts: [], tools: new Map(), ownerDestinations: [] }),
        findJobDestinations: () => [],
        readConsent: overrides?.readConsent ?? (() => Promise.resolve(null)),
      }),
  });

  return { ...actions, check };
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
