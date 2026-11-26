import type { ProposalContext, ProposalKindHandler, Withdrawal } from '@heynixie/proposals';
import {
  buildDiscardedOutcome,
  buildProposeDeps,
  withdrawInTransaction,
} from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { dayMs } from './suggested-rule-settings';

const withdrawHandler: ProposalKindHandler = {
  family: 'rule_change',
  lapseIntervalMs: (config) => config.lapseDays.rule_change * dayMs,
  ownsTransaction: false,
  readBodies: () => Promise.resolve(new Map()),
  readHashes: (_db, row) => Promise.resolve({ action: row.actionHash, rule: null }),
  approve: () =>
    Promise.resolve({
      status: 'refused',
      refusal: { error: 'NOT_ALLOWED', reason: 'withdraw_only' },
    }),
  discard: (_run, row, outcome) => Promise.resolve(buildDiscardedOutcome(row, outcome)),
};

// Settles an open rule-change proposal as withdrawn, through the shared lifecycle, so its row
// closes with the one settlement record that every other close writes. Does nothing for a closed
// proposal.
export function withdrawRuleProposal(
  tx: Transaction<unknown>,
  context: ProposalContext,
  proposalID: string,
): Promise<Withdrawal> {
  return withdrawInTransaction(
    buildProposeDeps({
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      handler: withdrawHandler,
    }),
    tx,
    proposalID,
    { byProposer: false },
  );
}
