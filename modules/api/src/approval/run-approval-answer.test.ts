import { expect, test } from 'bun:test';
import { claimAction, makeQueueRunnerActions, runActionAttempt } from '@heynixie/actions';
import type { AttemptCheck } from '@heynixie/actions';
import { createTestStep, queueTestAction, readTestAction } from '@heynixie/actions/test-utils';
import type { ActionAttempt } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { ORPCError } from '@orpc/client';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

interface HeldCall {
  readonly tool: string;
  readonly effects: readonly ('coding_start' | 'send')[];
  readonly input: JSONObject;

  // the input the ask shows, when it differs from the one the action stored
  readonly askedInput?: JSONObject;
}

async function setupTest() {
  const api = await startTestAPI();
  const step = await createTestStep(api.context);

  const taskID = step.lease.workID;

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);
  const calls: ActionAttempt[] = [];

  const asks =
    (call: HeldCall): AttemptCheck =>
    (check) =>
      Promise.resolve({
        kind: 'ask',
        cause: 'no_rule',
        destinations: [],
        proposalID: check.proposalID,
        proposal: {
          definitions: api.context.definitions(),
          thread: taskID,
          callSequence: 1,
          tool: call.tool,
          actionHash: check.action.action_hash,
          effects: call.effects,
          cause: 'no_rule',
          input: call.askedInput ?? check.arguments,
          destinations: [],
          reopen: { proposalID: check.proposalID, actionID: check.action.action_id },
        },
      });

  const runNext = async (tool: string, checkAttempt: AttemptCheck) => {
    const lease = await claimAction(api.context, { holder: 'runner-a', leaseMs: 60_000 });

    invariant(lease, 'an action waits to run');

    await runActionAttempt(api.context, lease, {
      connectors: new Map([
        [
          tool,
          {
            run: (call: ActionAttempt) => {
              calls.push(call);

              return Promise.resolve({ kind: 'success' as const, result: {} });
            },
          },
        ],
      ]),
      leaseMs: 60_000,
      checkAttempt,
    });
  };

  return {
    calls,
    readLogged: () => api.logged,
    readAction: (actionID: string) => readTestAction(api.context.log.writer, actionID),

    // a runner queues the call through the real runner queue, and its attempt asks
    holdRunnerAction: async (call: HeldCall, hashParts: readonly string[]) => {
      const queue = makeQueueRunnerActions(api.context);

      const [actionID] = await withWriteTransaction(api.context.log.writer, (tx) =>
        queue(tx, {
          taskID,
          stepKey: step.stepKey,
          actions: [
            {
              tool: call.tool,
              args: call.input,
              hashParts,
              causedBy: { kind: 'record', sequence: 1 },
            },
          ],
        }),
      );

      invariant(actionID, 'the runner queue queues the action');

      await runNext(call.tool, asks(call));

      return actionID;
    },

    // a model action queued under a hash of an older form, whose attempt asks
    holdModelAction: async (call: HeldCall) => {
      const queued = await queueTestAction(api.context, {
        step,
        tool: call.tool,
        actionHash: 'sha256:older-form',
        arguments: call.input,
        decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
        callSequence: 1,
      });

      await runNext(call.tool, asks(call));

      return queued.actionID;
    },

    readOpenProposalID: async () => {
      const listed = await client.approvals.listItems();

      return listed.items.at(0)?.proposal.proposalID;
    },

    approveOpenCard: async () => {
      const listed = await client.approvals.listItems();

      const item = listed.items.at(0);

      invariant(item, 'the held action opened a card');

      return client.approvals.answerProposal({
        proposalID: item.proposal.proposalID,
        actionHash: item.proposal.actionHash,
        choice: 'approve',
        clientActionID: crypto.randomUUID(),
      });
    },

    runApproved: (tool: string) =>
      runNext(tool, () => Promise.resolve({ kind: 'go', destinations: [] })),
  };
}

test.each([
  {
    tool: 'coding.spawn',
    hashParts: ['spawn'],
    input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
  },
  { tool: 'coding.stop', hashParts: ['stop'], input: { session: 'cloud.3f9a1c2e.a' } },
  {
    tool: 'coding.steer',
    hashParts: ['12'],
    input: { session: 'cloud.3f9a1c2e.a', text: 'Use the cache.' },
  },
  {
    tool: 'coding.message',
    hashParts: ['call-7'],
    input: { session: 'cloud.3f9a1c2e.a', text: 'Hello.' },
  },
])(
  '#approvals.answerProposal releases a held $tool that a runner queued, and it runs',
  async (row) => {
    const ctx = await setupTest();

    const actionID = await ctx.holdRunnerAction(
      { tool: row.tool, effects: ['coding_start'], input: row.input },
      row.hashParts,
    );

    const answered = await ctx.approveOpenCard();

    await ctx.runApproved(row.tool);

    expect({
      state: answered.state,
      action: await ctx.readAction(actionID),
      args: ctx.calls.map((call) => call.arguments),
    }).toStrictEqual({
      state: 'approved',
      action: expect.objectContaining({ status: 'done', is_approved: 1 }),
      args: [row.input],
    });
  },
);

test('#approvals.answerProposal releases a held model action whose stored hash is of an older form, and it runs', async () => {
  const ctx = await setupTest();

  const actionID = await ctx.holdModelAction({
    tool: 'test.send',
    effects: ['send'],
    input: { to: 'team' },
  });

  const answered = await ctx.approveOpenCard();

  await ctx.runApproved('test.send');

  expect({ state: answered.state, action: await ctx.readAction(actionID) }).toStrictEqual({
    state: 'approved',
    action: expect.objectContaining({ status: 'done', is_approved: 1 }),
  });
});

test('#approvals.answerProposal refuses with action_changed when the stored arguments differ from the ones the card showed, and runs nothing', async () => {
  const ctx = await setupTest();

  const actionID = await ctx.holdRunnerAction(
    {
      tool: 'coding.spawn',
      effects: ['coding_start'],
      input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
      askedInput: { name: 'Fix the flaky test', brief: 'Something else.' },
    },
    ['spawn'],
  );

  const refusal = await ctx.approveOpenCard().catch((error: unknown) => error);

  expect({
    refusal: refusal instanceof ORPCError ? { code: refusal.code, data: refusal.data } : refusal,
    action: await ctx.readAction(actionID),
    calls: ctx.calls,
  }).toStrictEqual({
    refusal: { code: 'NOT_ALLOWED', data: { reason: 'action_changed' } },
    action: expect.objectContaining({ status: 'pending', is_approved: 0 }),
    calls: [],
  });
});

test('#approvals.answerProposal logs one line with the proposal and the reason when it refuses an answer', async () => {
  const ctx = await setupTest();

  await ctx.holdRunnerAction(
    {
      tool: 'coding.spawn',
      effects: ['coding_start'],
      input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
      askedInput: { name: 'Fix the flaky test', brief: 'Something else.' },
    },
    ['spawn'],
  );

  const proposalID = await ctx.readOpenProposalID();

  await ctx.approveOpenCard().catch(() => null);

  expect(ctx.readLogged().map((line) => JSON.parse(line))).toStrictEqual([
    { event: 'approvals.answer_refused', fields: { proposalID, reason: 'action_changed' } },
  ]);
});
