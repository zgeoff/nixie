import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMockSharedProposal } from '@heynixie/proposals/test-utils';
import { buildActionHash } from './build-action-hash';
import { buildActionProposalInput } from './build-action-proposal-input';
import type { HeldActionFacts } from './make-action-proposal-handler';
import { makeActionProposalHandler } from './make-action-proposal-handler';

async function setupTest() {
  const started = await startTestLog();

  const queuedTools: string[] = [];
  const held: { current: HeldActionFacts | null } = { current: null };

  const handler = makeActionProposalHandler({
    log: started.log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    readBodyFields: (_db, request) => {
      if (request.tool !== 'memory.retopic') {
        return Promise.resolve({ status: 'none' });
      }

      return Promise.resolve({
        status: 'fields',
        sentence: 'self/lines → self/diary, 2 items',
        fields: { items: '[ab12] tent poles' },
      });
    },
    writeThreadRecord: () => Promise.resolve(),
    writeRule: () => Promise.resolve(),
    queueApproved: (_tx, approved) => {
      queuedTools.push(approved.tool);

      return Promise.resolve('action-1');
    },
    readHeldAction: () => Promise.resolve(held.current),
    failHeld: () => Promise.resolve(),
    runAfterRule: () => Promise.resolve(),
    writeSuggestedRuleDecline: () => Promise.resolve(),
    runSuggestedRuleCheck: () => Promise.resolve(),
  });

  return {
    ...started,
    queuedTools,
    approveVariantCall: async () => {
      const input = { name: 'Login fix', brief: 'Fix it.', runner: 'atc' };

      // the call hashes by the tool's own name, and the proposal names the variant it picked
      const actionHash = buildActionHash({ tool: 'task.start', input, destinations: [] });

      const proposed = buildActionProposalInput({
        definitions: { snapshotHash: 'snapshot-1' },
        thread: 'conversation',
        callSequence: 1,
        tool: 'task.start/atc',
        actionHash,
        effects: ['coding_start'],
        cause: 'ask_rule',
        input,
        destinations: [],
      });

      const [written] = await writeRecords(started.log, [proposed.record]);

      const row = buildMockSharedProposal({
        id: proposed.proposalID,
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
        actionHash,
      });

      return withWriteTransaction(started.writer, (tx) =>
        handler.approve(
          { tx, guard: () => Promise.resolve(), settle: () => Promise.resolve() },
          row,
          {
            proposalID: row.id,
            actionHash,
            choice: 'approve',
            identityID: 'identity-1',
          },
        ),
      );
    },
    approveReopened: async (heldAction: HeldActionFacts | null) => {
      held.current = heldAction;

      const input = { name: 'Fix the login test', brief: 'Find why it fails.' };

      // a runner hashes its action by its own parts, which the ask keeps
      const actionHash = 'sha256:runner-spawn';

      const proposed = buildActionProposalInput({
        definitions: { snapshotHash: 'snapshot-1' },
        thread: 'conversation',
        callSequence: 1,
        tool: 'coding.spawn',
        actionHash,
        effects: ['coding_start'],
        cause: 'ask_rule',
        input,
        destinations: [],
        reopen: { proposalID: crypto.randomUUID(), actionID: 'action-1' },
      });

      const [written] = await writeRecords(started.log, [proposed.record]);

      const row = buildMockSharedProposal({
        id: proposed.proposalID,
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
        actionHash,
      });

      return withWriteTransaction(started.writer, (tx) =>
        handler.approve(
          { tx, guard: () => Promise.resolve(), settle: () => Promise.resolve() },
          row,
          { proposalID: row.id, actionHash, choice: 'approve', identityID: 'identity-1' },
        ),
      );
    },
    approveBoundClick: async () => {
      const input = { x: 10, y: 20 };
      const expectWindow = { id: '0x1', picture: 'sha256:picture-1' };

      const actionHash = buildActionHash({
        tool: 'computer.screen_click',
        input,
        destinations: ['site.test'],
        expectWindow,
      });

      const proposed = buildActionProposalInput({
        definitions: { snapshotHash: 'snapshot-1' },
        thread: 'conversation',
        callSequence: 1,
        tool: 'computer.screen_click',
        actionHash,
        expectWindow,
        effects: ['send'],
        cause: 'ask_rule',
        input,
        destinations: [{ value: 'site.test', replyTarget: false }],
      });

      const [written] = await writeRecords(started.log, [proposed.record]);

      const row = buildMockSharedProposal({
        id: proposed.proposalID,
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
        actionHash,
      });

      return withWriteTransaction(started.writer, (tx) =>
        handler.approve(
          { tx, guard: () => Promise.resolve(), settle: () => Promise.resolve() },
          row,
          {
            proposalID: row.id,
            actionHash,
            choice: 'approve',
            identityID: 'identity-1',
          },
        ),
      );
    },
    readRetopicBody: async () => {
      const proposed = buildActionProposalInput({
        definitions: { snapshotHash: 'snapshot-1' },
        thread: 'conversation',
        callSequence: 1,
        tool: 'memory.retopic',
        effects: ['memory_write'],
        cause: 'no_rule',
        input: { items: ['ab12'], to: { topic: 'diary', subject: 'self' } },
        destinations: [],
      });

      const [written] = await writeRecords(started.log, [proposed.record]);

      const row = buildMockSharedProposal({
        id: proposed.proposalID,
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
      });

      const bodies = await handler.readBodies(started.writer.db, [row]);

      return bodies.get(row.id);
    },
    readBody: async (budgetReached?: string) => {
      const proposed = buildActionProposalInput({
        definitions: { snapshotHash: 'snapshot-1' },
        thread: 'conversation',
        callSequence: 1,
        tool: 'test.buy',
        effects: ['spend'],
        cause: 'always_ask',
        input: { amount: 6 },
        destinations: [],
        ...(budgetReached === undefined ? {} : { budgetReached }),
      });

      const [written] = await writeRecords(started.log, [proposed.record]);

      const row = buildMockSharedProposal({
        id: proposed.proposalID,
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
      });

      const bodies = await handler.readBodies(started.writer.db, [row]);

      return bodies.get(row.id);
    },
  };
}

test('it names the budget that caused the question and its reset on the card', async () => {
  const ctx = await setupTest();

  const body = await ctx.readBody(
    'budget reached: groceries ($6.00 of $10.00). Resets at midnight.',
  );

  expect(body).toStrictEqual({
    sentence:
      'Run test.buy (spend). Budget reached: groceries ($6.00 of $10.00). Resets at midnight.',
    fields: { amount: '6' },
    ruleSentence: null,
    approveLabel: 'Run test.buy',
  });
});

test('it shows the sentence and the fields that the tool reads for its own call on the card', async () => {
  const ctx = await setupTest();
  const body = await ctx.readRetopicBody();

  expect(body).toMatchObject({
    sentence: 'self/lines → self/diary, 2 items',
    fields: { items: '[ab12] tent poles' },
  });
});

test('it shows no budget sentence on the card of a call no budget refused', async () => {
  const ctx = await setupTest();
  const body = await ctx.readBody();

  expect(body?.sentence).toBe('Run test.buy (spend).');
});

test('it queues the approval of a click that its window and picture bind', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.approveBoundClick();

  expect(outcome.status).toBe('done');
});

test('it queues the approval of a variant call under the tool that the call named', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.approveVariantCall();

  expect({ status: outcome.status, queued: ctx.queuedTools }).toStrictEqual({
    status: 'done',
    queued: ['task.start'],
  });
});

test('it queues the approval of a reopened ask under the hash its own queue gave the action', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.approveReopened({
    actionHash: 'sha256:runner-spawn',
    arguments: { brief: 'Find why it fails.', name: 'Fix the login test' },
  });

  expect({ status: outcome.status, queued: ctx.queuedTools }).toStrictEqual({
    status: 'done',
    queued: ['coding.spawn'],
  });
});

test.each([
  {
    held: {
      actionHash: 'sha256:other',
      arguments: { name: 'Fix the login test', brief: 'Find why it fails.' },
    },
    reason: 'action_changed',
  },
  {
    held: {
      actionHash: 'sha256:runner-spawn',
      arguments: { name: 'Fix the login test', brief: 'Delete it.' },
    },
    reason: 'action_changed',
  },
  { held: { actionHash: 'sha256:runner-spawn', arguments: null }, reason: 'arguments_gone' },
  { held: null, reason: 'held_action_gone' },
])(
  'it refuses the approval of a reopened ask with $reason when the held action is $held',
  async (row) => {
    const ctx = await setupTest();
    const outcome = await ctx.approveReopened(row.held);

    expect({ outcome, queued: ctx.queuedTools }).toStrictEqual({
      outcome: { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: row.reason } },
      queued: [],
    });
  },
);
