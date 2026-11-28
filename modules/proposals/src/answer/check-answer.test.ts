import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { proposeInTransaction } from '../propose/propose-in-transaction';
import { startTestProposals } from '../test-utils/start-test-proposals';
import { answerProposal } from './answer-proposal';
import type { ProposalKindHandler } from './proposal-kind-handler';

interface PlaceAnswer {
  readonly trust?: 'read' | 'act';
  readonly placeHash?: string;
  readonly choice?: 'approve' | 'decline';
}

async function setupTest() {
  const placeHashes = { read: 'place-read-hash', act: 'place-act-hash' };

  const actionHandler: ProposalKindHandler = {
    family: 'action',
    lapseIntervalMs: () => 24 * 60 * 60 * 1000,
    ownsTransaction: false,
    readBodies: () => Promise.resolve(new Map()),
    readHashes: (_db, row) =>
      Promise.resolve({ action: row.actionHash, rule: null, place: placeHashes }),
    approve: (_run, row) =>
      Promise.resolve({
        status: 'done',
        result: { proposalID: row.id, state: 'approved' },
        usedBy: null,
        detail: null,
        otherStakes: [],
      }),
    discard: () => Promise.reject(new Error('no discard in this test')),
  };

  const proposals = await startTestProposals({ handlers: [actionHandler] });

  const proposed = await withWriteTransaction(proposals.log.writer, (tx) =>
    proposeInTransaction(proposals.deps, tx, {
      family: 'action',
      kind: 'action',
      cause: 'outside_steering',
      riskClass: 'routine',
      actionHash: 'hash-a',
      ruleHash: null,
      thread: 'task-a',
      taskID: null,
      deadlineAt: null,
      sameThing: null,
    }),
  );

  return {
    placeHashes,
    answer: (extra: PlaceAnswer) =>
      answerProposal(
        proposals.deps,
        {
          proposalID: proposed.proposalID,
          actionHash: 'hash-a',
          choice: extra.choice ?? 'approve',
          identityID: 'owner',
          ...(extra.trust === undefined ? {} : { trust: extra.trust }),
          ...(extra.placeHash === undefined ? {} : { placeHash: extra.placeHash }),
        },
        { family: 'action' },
      ),
  };
}

test('it refuses a trust answer that echoes the action hash without the place hash', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.answer({ trust: 'read' });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'place_hash' },
  });
});

test('it refuses a trust answer that echoes the place hash of the other level', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.answer({ trust: 'read', placeHash: ctx.placeHashes.act });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'CONFLICT', current: { actionHash: 'hash-a', ruleHash: null } },
  });
});

test('it refuses a place hash with no trust level', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.answer({ placeHash: ctx.placeHashes.read });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'trust_choice' },
  });
});

test('it refuses a trust answer that declines', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.answer({
    trust: 'read',
    placeHash: ctx.placeHashes.read,
    choice: 'decline',
  });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'trust_choice' },
  });
});

test('it answers a trust to read on a routine row with no passkey', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.answer({ trust: 'read', placeHash: ctx.placeHashes.read });

  expect(outcome).toMatchObject({ status: 'answered', result: { state: 'approved' } });
});

test('it asks for the passkey on a trust to act, though the row is routine', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.answer({ trust: 'act', placeHash: ctx.placeHashes.act });

  expect(outcome).toStrictEqual({
    status: 'passkey_refused',
    refusal: { error: 'PASSKEY_REQUIRED' },
  });
});
