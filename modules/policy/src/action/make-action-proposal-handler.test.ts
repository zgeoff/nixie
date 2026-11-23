import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMockSharedProposal } from '@heynixie/proposals/test-utils';
import { buildActionHash } from './build-action-hash';
import { buildActionProposalInput } from './build-action-proposal-input';
import { makeActionProposalHandler } from './make-action-proposal-handler';

async function setupTest() {
  const started = await startTestLog();

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
    queueApproved: () => Promise.resolve('action-1'),
    failHeld: () => Promise.resolve(),
    runAfterRule: () => Promise.resolve(),
    writeGapDecline: () => Promise.resolve(),
    runGapCheck: () => Promise.resolve(),
  });

  return {
    ...started,
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
        thread: 'conversation',
        createdSequence: written?.sequence ?? 0,
        actionHash,
      });

      return withWriteTransaction(started.writer, (tx) =>
        handler.approve({ tx, guard: () => Promise.resolve() }, row, {
          proposalID: row.id,
          actionHash,
          choice: 'approve',
          identityID: 'identity-1',
        }),
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
