import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalConfig } from '@heynixie/proposals';
import { buildProposeDeps, createUnusedShortID, proposeInTransaction } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { ActionProposalFacts } from './build-action-proposal-input';
import { buildActionProposalInput } from './build-action-proposal-input';

export interface ActionProposalWriter {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;

  // the lapse of each family; the defaults apply when the server sets none
  readonly proposalConfig?: ProposalConfig | undefined;
}

// Creates the shared row of an ask, with the lapse that the config sets for actions, then writes
// the ask's own record in the same transaction. Returns the short ID the model reads.
export async function writeActionProposal(
  tx: Transaction<unknown>,
  writer: ActionProposalWriter,
  facts: ActionProposalFacts,
): Promise<string> {
  const proposal = buildActionProposalInput({ ...facts, shortID: await createUnusedShortID(tx) });

  await proposeInTransaction(
    buildProposeDeps({
      log: writer.log,
      clock: writer.clock,
      definitions: writer.definitions,
      config: writer.proposalConfig,
    }),
    tx,
    {
      proposalID: proposal.proposalID,
      shortID: proposal.shortID,
      family: 'action',
      kind: 'action',
      cause: facts.cause,
      riskClass: proposal.riskClass,
      actionHash: proposal.actionHash,
      ruleHash: proposal.ruleHash,
      thread: facts.thread,
      taskID: null,
      deadlineAt: facts.deadlineAt ?? null,
      sameThing: null,
    },
  );

  await writeRecordsInTransaction(tx, writer.log, [proposal.record]);

  return proposal.shortID;
}
