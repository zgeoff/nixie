import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { proposalsSettledCodec } from '@heynixie/proposals';
import { buildEventRegistry } from './build-event-registry';
import { buildProposalSettledKind } from './build-proposal-settled-kind';
import { readEventsBlock } from './read-events-block';

async function setupTest() {
  const base = await startTestLog();

  return {
    ...base,
    readBlock: (through: number) =>
      readEventsBlock(
        buildEventRegistry([buildProposalSettledKind(base.log, 'conversation')]),
        { after: 0, through },
        { ownerName: 'Avery', timeZone: 'UTC' },
      ),
  };
}

test('it lists every settlement of a proposer past the cap of 10 events', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.log,
    Array.from({ length: 11 }, (_, index) => ({
      kind: 'proposals.settled' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: proposalsSettledCodec.encode({
        proposalID: `proposal-${index}`,
        shortID: `short-${index}`,
        family: 'skill',
        outcome: 'approved',
        answeredBy: 'owner',
        usedBy: null,
        detail: null,
        task: null,
        replaced: null,
        byProposer: false,
      }),
    })),
  );

  const block = await ctx.readBlock(11);

  expect([block.count, block.text]).toStrictEqual([11, expect.not.stringContaining('…and')]);
});

test('it lists a settlement past the first 1000 that the turn boundary covers', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.log,
    Array.from({ length: 1001 }, (_, index) => ({
      kind: 'proposals.settled' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: proposalsSettledCodec.encode({
        proposalID: `proposal-${index}`,
        shortID: `short-${index}`,
        family: 'skill',
        outcome: 'approved',
        answeredBy: 'owner',
        usedBy: null,
        detail: null,
        task: null,
        replaced: null,
        byProposer: false,
      }),
    })),
  );

  const block = await ctx.readBlock(1001);

  expect(block.count).toBe(1001);
});
