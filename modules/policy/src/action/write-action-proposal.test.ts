import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readProposal } from '@heynixie/proposals';
import { startShortIDDraws, startTestProposals } from '@heynixie/proposals/test-utils';
import { writeActionProposal } from './write-action-proposal';

async function setupTest() {
  const proposals = await startTestProposals({ families: ['action'] });

  const writer = {
    log: proposals.log,
    clock: proposals.clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  return {
    ...proposals,
    ask: (to: string) =>
      withWriteTransaction(proposals.log.writer, (tx) =>
        writeActionProposal(tx, writer, {
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          callSequence: 1,
          tool: 'test.send',
          effects: ['send'],
          cause: 'no_rule',
          input: { to },
          destinations: [{ value: to, replyTarget: false }],
        }),
      ),
  };
}

test('it records the task that proposed the action on the proposal', async () => {
  const ctx = await setupTest();
  const shortID = await ctx.ask('sam@example.org');
  const proposal = await readProposal(ctx.log.writer.db, shortID);

  expect(proposal?.taskID).toBe('conversation');
});

test('it draws another short ID for a held action when the drawn one names an existing proposal', async () => {
  const ctx = await setupTest();

  startShortIDDraws(['dup', 'dup', 'fresh']);

  const first = await ctx.ask('sam@example.org');
  const second = await ctx.ask('kim@example.org');

  expect([first, second]).toStrictEqual(['dup', 'fresh']);
});
