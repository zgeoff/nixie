import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildMockSharedProposal } from '@heynixie/proposals/test-utils';
import { buildActionProposalInput } from './build-action-proposal-input';
import { makeActionProposalHandler } from './make-action-proposal-handler';

async function setupTest() {
  const started = await startTestLog();

  const handler = makeActionProposalHandler({
    log: started.log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
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

test('it shows no budget sentence on the card of a call no budget refused', async () => {
  const ctx = await setupTest();
  const body = await ctx.readBody();

  expect(body?.sentence).toBe('Run test.buy (spend).');
});
