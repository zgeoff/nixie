import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { readProposal } from '../rows/read-proposal';
import { startTestProposals } from '../test-utils/start-test-proposals';
import { proposeInTransaction } from './propose-in-transaction';
import type { ProposeInput } from './propose-in-transaction';
import { withdrawInTransaction } from './withdraw-in-transaction';

async function setupTest() {
  const proposals = await startTestProposals();

  const base: ProposeInput = {
    family: 'skill',
    kind: 'internal_change',
    cause: 'skill_write',
    riskClass: 'routine',
    actionHash: 'hash-a',
    ruleHash: null,
    thread: 'task-a',
    taskID: null,
    deadlineAt: null,
    sameThing: 'trip-planning',
  };

  return {
    ...proposals,
    propose: (overrides: Partial<ProposeInput> = {}) =>
      withWriteTransaction(proposals.log.writer, (tx) =>
        proposeInTransaction(proposals.deps, tx, { ...base, ...overrides }),
      ),
    read: (proposalID: string) => readProposal(proposals.log.writer.db, proposalID),
  };
}

test('it creates the row with the lapse of its family', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();
  const row = await ctx.read(proposed.proposalID);

  expect(row).toMatchObject({
    state: 'pending',
    family: 'skill',
    thread: 'task-a',
    lapsesAt: ctx.clock.now() + 14 * 24 * 60 * 60 * 1000,
  });
});

test('it withdraws the open proposal of the same thing from the same proposer', async () => {
  const ctx = await setupTest();
  const first = await ctx.propose();
  const second = await ctx.propose();
  const firstRow = await ctx.read(first.proposalID);

  expect([second.replaced, firstRow?.state]).toStrictEqual([first.shortID, 'withdrawn']);
});

test('it keeps the open proposal of the same thing from another proposer', async () => {
  const ctx = await setupTest();
  const first = await ctx.propose();
  const second = await ctx.propose({ thread: 'task-b' });
  const firstRow = await ctx.read(first.proposalID);

  expect([second.replaced, firstRow?.state]).toStrictEqual([null, 'pending']);
});

test('it never replaces a proposal with no proposer', async () => {
  const ctx = await setupTest();
  const first = await ctx.propose({ thread: null });
  const second = await ctx.propose({ thread: null });
  const firstRow = await ctx.read(first.proposalID);

  expect([second.replaced, firstRow?.state]).toStrictEqual([null, 'pending']);
});

test('it never replaces a proposal with no key', async () => {
  const ctx = await setupTest();
  const first = await ctx.propose({ sameThing: null });
  const second = await ctx.propose({ sameThing: null });
  const firstRow = await ctx.read(first.proposalID);

  expect([second.replaced, firstRow?.state]).toStrictEqual([null, 'pending']);
});

test('it gives the replaced short ID in the settlement of the replacement', async () => {
  const ctx = await setupTest();
  const first = await ctx.propose();
  const second = await ctx.propose();

  await withWriteTransaction(ctx.log.writer, (tx) =>
    withdrawInTransaction(ctx.deps, tx, second.proposalID, { byProposer: false }),
  );

  const settled = await readRecords(ctx.log, { afterSequence: 0, kinds: ['proposals.settled'] });

  const last = settled.at(-1)?.record.payload;

  expect(last).toMatchObject({ proposalID: second.proposalID, replaced: first.shortID });
});

test('it resolves a short ID that 2 rows share to the newest row, and a proposal ID to its own row', async () => {
  const ctx = await setupTest();
  const older = await ctx.propose({ shortID: 'S7', sameThing: null });
  const newer = await ctx.propose({ shortID: 'S7', sameThing: null });
  const byShortID = await ctx.read('S7');
  const byOlderID = await ctx.read(older.proposalID);

  expect([byShortID?.id, byOlderID?.id]).toStrictEqual([newer.proposalID, older.proposalID]);
});
