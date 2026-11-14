import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildActionProposalInput } from './build-action-proposal-input';
import { readActionProposals } from './read-action-proposals';
import { readPendingActionProposals } from './read-pending-action-proposals';
import { writeActionProposalLapses } from './write-action-proposal-lapses';

async function setupTest() {
  const started = await startTestLog();

  const proposed = buildActionProposalInput({
    definitions: { snapshotHash: 'snapshot-1' },
    thread: 'conversation',
    callSequence: 1,
    tool: 'mail.send',
    effects: ['send'],
    cause: 'no_rule',
    input: { to: 'sam@example.org', body: 'Hello.' },
    destinations: [{ value: 'sam@example.org', replyTarget: false }],
  });

  await writeRecords(started.log, [proposed.record]);

  return {
    ...started,
    shortID: proposed.shortID,
    sweep: () =>
      writeActionProposalLapses({
        log: started.log,
        clock: started.clock,
        definitions: () => ({ snapshotHash: 'snapshot-1' }),
      }),
  };
}

test('it keeps a proposal pending with its destinations until 72 hours have passed', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(72 * 3_600_000 - 1);

  const lapsed = await ctx.sweep();
  const pending = await readPendingActionProposals(ctx.log, ctx.clock.now());

  expect(lapsed).toBe(0);

  expect(pending).toMatchObject([
    { shortID: ctx.shortID, tool: 'mail.send', destinations: ['sam@example.org'], outcome: null },
  ]);
});

test('it lapses a proposal once 72 hours have passed, and lists it no more', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(72 * 3_600_000 + 1);

  const lapsed = await ctx.sweep();
  const proposals = await readActionProposals(ctx.log.writer.db);
  const pending = await readPendingActionProposals(ctx.log, ctx.clock.now());

  expect(lapsed).toBe(1);
  expect(proposals.map((proposal) => proposal.outcome)).toStrictEqual(['lapsed']);
  expect(pending).toStrictEqual([]);
});
