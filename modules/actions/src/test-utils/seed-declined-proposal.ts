import { makeActionProposalHandler, mapActionProposalRecord } from '@heynixie/policy';
import { answerProposal, buildProposalsProjection, readProposal } from '@heynixie/proposals';
import { buildMockSettlementDeps } from '@heynixie/proposals/test-utils';
import type { TasksContext } from '@heynixie/tasks';
import { readSettlementTarget, writeThreadRecordInTransaction } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createApprovedAction } from '../action/create-approved-action';
import { failHeldAction } from '../action/fail-held-action';
import { readHeldAction } from '../action/read-held-action';

// The owner declines the action proposal with this short ID, through the answer that the approval
// card sends, which writes the answer record and the settlement.
export async function seedDeclinedProposal(context: TasksContext, shortID: string): Promise<void> {
  const row = await readProposal(context.log.writer.db, shortID);

  invariant(row, `no proposal has the short ID ${shortID}`);

  const handler = makeActionProposalHandler({
    log: context.log,
    definitions: context.definitions,
    writeThreadRecord: (tx, input) => writeThreadRecordInTransaction(tx, context, input),
    queueApproved: (tx, approved) => createApprovedAction(tx, context, approved),
    readHeldAction: (tx, request) => readHeldAction(tx, context, request),
    failHeld: (tx, held, reason) => failHeldAction(tx, context, { proposalID: held.id, reason }),
    writeRule: () => Promise.reject(new Error('a decline writes no rule')),
    runAfterRule: () => Promise.resolve(),
    writeSuggestedRuleDecline: () => Promise.resolve(),
    runSuggestedRuleCheck: () => Promise.resolve(),
  });

  const outcome = await answerProposal(
    {
      ...buildMockSettlementDeps(),
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      handlers: new Map([['action', handler]]),
      projection: buildProposalsProjection([mapActionProposalRecord]),
      readDeferContext: () => Promise.resolve({ quietHours: null, zone: 'UTC' }),
      writeThreadRecord: (tx, input) => writeThreadRecordInTransaction(tx, context, input),
      readSettlementTarget,
    },
    { proposalID: row.id, actionHash: row.actionHash, choice: 'decline', identityID: 'owner-1' },
    { passkey: { kind: 'host' } },
  );

  invariant(outcome.status === 'answered', 'the owner can decline the proposal');
}
