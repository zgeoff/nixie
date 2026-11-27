import { expect, test } from 'bun:test';
import {
  buildActionHash,
  claimAction,
  makeQueueRunnerActions,
  runActionAttempt,
} from '@heynixie/actions';
import type { AttemptCheck } from '@heynixie/actions';
import {
  createTestStep,
  queueTestAction,
  readTestAction,
  seedStoredArguments,
} from '@heynixie/actions/test-utils';
import type { ActionAttempt } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { ORPCError } from '@orpc/client';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

interface HeldCall {
  readonly tool: string;
  readonly effects: readonly ('coding_start' | 'send' | 'spend')[];
  readonly input: JSONObject;
  readonly cause?: 'always_ask' | 'no_rule';
}

interface OpenCard {
  readonly proposalID: string;
  readonly actionHash: string;
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
        cause: call.cause ?? 'no_rule',
        destinations: [],
        proposalID: check.proposalID,
        proposal: {
          definitions: api.context.definitions(),
          thread: taskID,
          callSequence: 1,
          tool: call.tool,
          actionHash: check.action.action_hash,
          effects: call.effects,
          cause: call.cause ?? 'no_rule',
          input: check.arguments,
          destinations: [],
          reopen: { proposalID: check.proposalID, actionID: check.action.action_id },
        },
      });

  const queueRunnerAction = async (
    call: HeldCall,
    hashParts: readonly string[],
    queuedStep: typeof step = step,
  ) => {
    const queue = makeQueueRunnerActions(api.context);

    const [actionID] = await withWriteTransaction(api.context.log.writer, (tx) =>
      queue(tx, {
        taskID: queuedStep.lease.workID,
        stepKey: queuedStep.stepKey,
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

    return actionID;
  };

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
      const actionID = await queueRunnerAction(call, hashParts);

      await runNext(call.tool, asks(call));

      return actionID;
    },

    // another task's action, queued through the same runner queue, that holds other arguments
    queueOtherRunnerAction: async (call: HeldCall, hashParts: readonly string[]) => {
      const other = await createTestStep(api.context);

      return queueRunnerAction(call, hashParts, other);
    },

    swapStoredArguments: (actionID: string, fromActionID: string) =>
      seedStoredArguments(api.context.log.writer, { actionID, fromActionID }),

    stopTask: () => writeTaskControl(api.context, { taskID, control: 'stop' }),

    // a model action queued under a hash of an older form, whose attempt asks
    holdModelAction: async (call: HeldCall) => {
      const queued = await queueTestAction(api.context, {
        step,
        tool: call.tool,
        actionHash: buildActionHash(call.tool, call.input),
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

    readOpenCard: async () => {
      const listed = await client.approvals.listItems();

      const item = listed.items.at(0);

      invariant(item, 'the held action opened a card');

      return item.proposal;
    },

    answerCard: (card: OpenCard, choice: 'approve' | 'decline', clientActionID: string) =>
      client.approvals.answerProposal({
        proposalID: card.proposalID,
        actionHash: card.actionHash,
        choice,
        clientActionID,
      }),

    // the attempt's own check asks again, as it does while no rule allows the call, and the
    // approval is what lets the attempt go ahead
    runApproved: (call: HeldCall) => runNext(call.tool, asks(call)),
  };
}

test.each([
  {
    tool: 'coding.spawn',
    hashParts: ['spawn'],
    effects: ['coding_start'],
    input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
  },
  {
    tool: 'coding.stop',
    hashParts: ['stop'],
    effects: ['coding_start'],
    input: { session: 'cloud.3f9a1c2e.a' },
  },
  {
    tool: 'coding.steer',
    hashParts: ['12'],
    effects: ['send'],
    input: { session: 'cloud.3f9a1c2e.a', text: 'Use the cache.' },
  },
  {
    tool: 'coding.message',
    hashParts: ['call-7'],
    effects: ['send'],
    input: { session: 'cloud.3f9a1c2e.a', text: 'Hello.' },
  },
] as const)(
  '#approvals.answerProposal releases a held $tool that a runner queued, and it runs',
  async (row) => {
    const ctx = await setupTest();

    const call = { tool: row.tool, effects: row.effects, input: row.input };

    const actionID = await ctx.holdRunnerAction(call, row.hashParts);
    const answered = await ctx.approveOpenCard();

    await ctx.runApproved(call);

    expect({
      state: answered.state,
      action: await ctx.readAction(actionID),
      args: ctx.calls.map((attempt) => attempt.arguments),
    }).toStrictEqual({
      state: 'approved',
      action: expect.objectContaining({ status: 'done', is_approved: 1 }),
      args: [row.input],
    });
  },
);

test('#approvals.answerProposal releases a held model action whose stored hash is of the older form, and it runs', async () => {
  const ctx = await setupTest();

  const call = { tool: 'test.send', effects: ['send'], input: { to: 'team' } } as const;

  const actionID = await ctx.holdModelAction(call);
  const answered = await ctx.approveOpenCard();

  await ctx.runApproved(call);

  expect({ state: answered.state, action: await ctx.readAction(actionID) }).toStrictEqual({
    state: 'approved',
    action: expect.objectContaining({ status: 'done', is_approved: 1 }),
  });
});

test('#approvals.answerProposal refuses with action_changed when the stored arguments change after the ask, and runs nothing', async () => {
  const ctx = await setupTest();

  const call = {
    tool: 'coding.spawn',
    effects: ['coding_start'],
    input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
  } as const;

  const actionID = await ctx.holdRunnerAction(call, ['spawn']);

  const otherID = await ctx.queueOtherRunnerAction(
    { ...call, input: { name: 'Fix the flaky test', brief: 'Something else.' } },
    ['spawn'],
  );

  await ctx.swapStoredArguments(actionID, otherID);

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

test('#approvals.answerProposal refuses with held_action_gone when the task was stopped after the ask, and runs nothing', async () => {
  const ctx = await setupTest();

  const call = {
    tool: 'coding.spawn',
    effects: ['coding_start'],
    input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
  } as const;

  const actionID = await ctx.holdRunnerAction(call, ['spawn']);

  await ctx.stopTask();

  const refusal = await ctx.approveOpenCard().catch((error: unknown) => error);

  expect({
    refusal: refusal instanceof ORPCError ? { code: refusal.code, data: refusal.data } : refusal,
    action: await ctx.readAction(actionID),
  }).toStrictEqual({
    refusal: { code: 'NOT_ALLOWED', data: { reason: 'held_action_gone' } },
    action: expect.objectContaining({ is_approved: 0 }),
  });
});

test('#approvals.answerProposal logs one line with the proposal and the reason when it refuses an answer', async () => {
  const ctx = await setupTest();

  const call = {
    tool: 'coding.spawn',
    effects: ['coding_start'],
    input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
  } as const;

  const actionID = await ctx.holdRunnerAction(call, ['spawn']);

  const otherID = await ctx.queueOtherRunnerAction(
    { ...call, input: { name: 'Fix the flaky test', brief: 'Something else.' } },
    ['spawn'],
  );

  await ctx.swapStoredArguments(actionID, otherID);

  const proposalID = await ctx.readOpenProposalID();

  await ctx.approveOpenCard().catch(() => null);

  expect(ctx.readLogged().map((line) => JSON.parse(line))).toStrictEqual([
    { event: 'approvals.answer_refused', fields: { proposalID, reason: 'action_changed' } },
  ]);
});

test('#approvals.answerProposal logs the proposal and the reason when it refuses an answer that needs a passkey', async () => {
  const ctx = await setupTest();

  await ctx.holdRunnerAction(
    {
      tool: 'shop.buy',
      effects: ['spend'],
      cause: 'always_ask',
      input: { item: 'paint' },
    },
    ['buy'],
  );

  const proposalID = await ctx.readOpenProposalID();

  await ctx.approveOpenCard().catch(() => null);

  expect(ctx.readLogged().map((line) => JSON.parse(line))).toStrictEqual([
    { event: 'approvals.answer_refused', fields: { proposalID, reason: 'no_passkey' } },
  ]);
});

test('#approvals.answerProposal logs the proposal and the reason when it refuses a reused client action ID', async () => {
  const ctx = await setupTest();

  await ctx.holdRunnerAction(
    {
      tool: 'coding.spawn',
      effects: ['coding_start'],
      input: { name: 'Fix the flaky test', brief: 'Find why it fails.' },
    },
    ['spawn'],
  );

  const card = await ctx.readOpenCard();

  const proposalID = card.proposalID;
  const clientActionID = crypto.randomUUID();

  await ctx.answerCard(card, 'approve', clientActionID);

  const refusal = await ctx
    .answerCard(card, 'decline', clientActionID)
    .catch((error: unknown) => error);

  expect({
    refusal: refusal instanceof ORPCError ? refusal.code : refusal,
    logged: ctx.readLogged().map((line) => JSON.parse(line)),
  }).toStrictEqual({
    refusal: 'CLIENT_ACTION_ID_REUSED',
    logged: [
      {
        event: 'approvals.answer_refused',
        fields: { proposalID, reason: 'client_action_id_reused' },
      },
    ],
  });
});
