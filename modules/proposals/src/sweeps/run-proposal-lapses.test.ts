import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import type { ProposeInput } from '../propose/propose-in-transaction';
import { proposeInTransaction } from '../propose/propose-in-transaction';
import { readProposal } from '../rows/read-proposal';
import { startTestProposals } from '../test-utils/start-test-proposals';
import { runProposalLapses } from './run-proposal-lapses';

async function setupTest() {
  const proposals = await startTestProposals({ families: ['skill'] });

  const dayMs = 24 * 60 * 60 * 1000;

  const base: ProposeInput = {
    family: 'skill',
    kind: 'internal_change',
    cause: 'skill_write',
    riskClass: 'routine',
    actionHash: 'hash-a',
    ruleHash: null,
    thread: 'conversation',
    taskID: null,
    deadlineAt: null,
    sameThing: null,
  };

  return {
    ...proposals,
    dayMs,
    propose: (overrides: Partial<ProposeInput> = {}) =>
      withWriteTransaction(proposals.log.writer, (tx) =>
        proposeInTransaction(proposals.deps, tx, { ...base, ...overrides }),
      ),
    readState: async (proposalID: string) => {
      const row = await readProposal(proposals.log.writer.db, proposalID);

      return row?.state;
    },
    readSettled: () =>
      readRecords(proposals.log, { afterSequence: 0, kinds: ['proposals.settled'] }),
  };
}

test('it lapses an open proposal once its family wait passed, and tells its proposer', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  ctx.clock.advance(14 * ctx.dayMs);

  const lapsed = await runProposalLapses(ctx.deps);
  const settled = await ctx.readSettled();

  expect([lapsed, await ctx.readState(proposed.proposalID)]).toStrictEqual([1, 'lapsed']);

  expect(settled.map((entry) => [entry.record.thread, entry.record.payload])).toMatchObject([
    ['conversation', { proposalID: proposed.proposalID, outcome: 'lapsed', family: 'skill' }],
  ]);
});

test('it leaves a proposal open before its wait passed', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  ctx.clock.advance(14 * ctx.dayMs - 1);

  expect([
    await runProposalLapses(ctx.deps),
    await ctx.readState(proposed.proposalID),
  ]).toStrictEqual([0, 'pending']);
});

test('it leaves a proposal of a family with no handler open', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose({ family: 'mcp', cause: 'mcp_allow', thread: null });

  ctx.clock.advance(30 * ctx.dayMs);

  expect([
    await runProposalLapses(ctx.deps),
    await ctx.readState(proposed.proposalID),
  ]).toStrictEqual([0, 'pending']);
});

test('it takes the lapse of a family from the config', async () => {
  const ctx = await setupTest();

  const startMs = ctx.clock.now();

  const deps = {
    ...ctx.deps,
    config: { lapseDays: { ...ctx.deps.config.lapseDays, skill: 2 } },
  };

  const proposed = await withWriteTransaction(ctx.log.writer, (tx) =>
    proposeInTransaction(deps, tx, {
      family: 'skill',
      kind: 'internal_change',
      cause: 'skill_write',
      riskClass: 'routine',
      actionHash: 'hash-a',
      ruleHash: null,
      thread: 'conversation',
      taskID: null,
      deadlineAt: null,
      sameThing: null,
    }),
  );

  const row = await readProposal(ctx.log.writer.db, proposed.proposalID);

  expect(row?.lapsesAt).toBe(startMs + 2 * ctx.dayMs);
});
