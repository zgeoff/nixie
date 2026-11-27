import { expect, test } from 'bun:test';
import {
  buildActionHash,
  claimAction,
  makeQueueRunnerActions,
  runActionAttempt,
} from '@heynixie/actions';
import { createTestStep, queueTestAction, readTestAction } from '@heynixie/actions/test-utils';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import { codingActionDeclarations } from '@heynixie/coding';
import type { ActionAttempt } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import { makeDecisionPoint } from '@heynixie/policy';
import { makeAttemptCheck } from '@heynixie/server';
import type { ToolDefinition } from '@heynixie/tools';
import { buildToolRegistry, toolCalledCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';

// The attempt check is the one that a running nixie runs, over no rules, so every call asks.
async function setupTest() {
  const postNote: ToolDefinition = {
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

  const api = await startTestAPI();
  const step = await createTestStep(api.context);
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);
  const calls: ActionAttempt[] = [];

  const checkAttempt = makeAttemptCheck({
    log: api.context.log,
    clock: api.clock,
    definitions: api.context.definitions,
    registry: buildToolRegistry([postNote]),
    findRunnerDeclaration: (tool) => codingActionDeclarations.get(tool) ?? null,
    decisions: (findDeclaration, overrides) =>
      makeDecisionPoint({
        findDeclaration,
        readInputs: () =>
          Promise.resolve({ rules: [], contacts: [], tools: new Map(), ownerDestinations: [] }),
        findTaskDestinations: () => [],
        readConsent: overrides?.readConsent ?? (() => Promise.resolve(null)),
      }),
  });

  const runNext = async (tool: string) => {
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

  const readNewestSequence = async () => {
    const [newest] = await readRecords(api.context.log, {
      afterSequence: 0,
      thread: step.lease.workID,
      order: 'newest',
      limit: 1,
    });

    invariant(newest, 'the thread holds a record');

    return newest.record.sequence;
  };

  return {
    calls,
    readAction: (actionID: string) => readTestAction(api.context.log.writer, actionID),

    queueRunnerAction: async (tool: string, args: JSONObject, hashParts: readonly string[]) => {
      const queue = makeQueueRunnerActions(api.context);

      const sequence = await readNewestSequence();

      const [actionID] = await withWriteTransaction(api.context.log.writer, (tx) =>
        queue(tx, {
          taskID: step.lease.workID,
          stepKey: step.stepKey,
          actions: [{ tool, args, hashParts, causedBy: { kind: 'record', sequence } }],
        }),
      );

      invariant(actionID, 'the runner queue queues the action');

      return actionID;
    },

    // a model call that was recorded as asking, and its action queued under the older hash form
    queueModelAction: async (args: JSONObject) => {
      const [called] = await writeRecords(api.context.log, [
        {
          kind: toolCalledCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: step.lease.workID,
          payload: toolCalledCodec.encode({
            callID: 'call-1',
            runID: 'run-1',
            toolUseID: 'toolu_1',
            tool: postNote.name,
            model: 'claude-test-1',
            profile: 'chat-direct',
          }),
          decision: {
            outcome: 'ask',
            stage: 9,
            rule: null,
            cause: 'no_rule',
            inputs: {
              toolList: [postNote.name],
              context: 'task',
              definitionID: 'board-notes',
              sources: ['task'],
              turnMessageSequence: null,
              onBehalfOf: [],
            },
          },
          erasable: { input: args, destinations: [] },
        },
      ]);

      invariant(called, 'the call is recorded');

      const queued = await queueTestAction(api.context, {
        step,
        tool: postNote.name,
        actionHash: buildActionHash(postNote.name, args),
        arguments: args,
        decision: { outcome: 'allow', stage: 9, rule: { id: 'post-notes', revision: 1 } },
        callSequence: called.sequence,
      });

      return queued.actionID;
    },

    // the attempt asks, the owner approves the card it opened, and the attempt runs again
    approveThenRun: async (tool: string) => {
      await runNext(tool);

      const listed = await client.approvals.listItems();

      const item = listed.items.at(0);

      invariant(item, 'the held action opened a card');

      const answered = await client.approvals.answerProposal({
        proposalID: item.proposal.proposalID,
        actionHash: item.proposal.actionHash,
        choice: 'approve',
        clientActionID: crypto.randomUUID(),
      });

      await runNext(tool);

      return answered.state;
    },
  };
}

test.each([
  { tool: 'coding.spawn', hashParts: ['spawn'], args: { name: 'Login fix', prompt: 'Fix it.' } },
  { tool: 'coding.stop', hashParts: ['stop'], args: { session: 'atc:cloud.3f9a1c2e.1' } },
  {
    tool: 'coding.steer',
    hashParts: ['12'],
    args: { session: 'atc:cloud.3f9a1c2e.1', text: 'Check the cookie expiry.' },
  },
  {
    tool: 'coding.message',
    hashParts: ['call-7'],
    args: { session: 'atc:cloud.3f9a1c2e.1', text: 'The cache fix landed.' },
  },
])(
  'it releases a held $tool that a runner queued, when its card is approved, under the attempt check of a running nixie, and it runs',
  async (row) => {
    const ctx = await setupTest();
    const actionID = await ctx.queueRunnerAction(row.tool, row.args, row.hashParts);
    const state = await ctx.approveThenRun(row.tool);

    expect({
      state,
      action: await ctx.readAction(actionID),
      args: ctx.calls.map((attempt) => attempt.arguments),
    }).toStrictEqual({
      state: 'approved',
      action: expect.objectContaining({ status: 'done', is_approved: 1 }),
      args: [row.args],
    });
  },
);

test('it releases a held model action whose stored hash is of the older form, when its card is approved, under the attempt check of a running nixie, and it runs', async () => {
  const ctx = await setupTest();
  const actionID = await ctx.queueModelAction({ text: 'Boat is ready' });
  const state = await ctx.approveThenRun('notes.post');

  expect({
    state,
    action: await ctx.readAction(actionID),
    args: ctx.calls.map((attempt) => attempt.arguments),
  }).toStrictEqual({
    state: 'approved',
    action: expect.objectContaining({ status: 'done', is_approved: 1 }),
    args: [{ text: 'Boat is ready' }],
  });
});
