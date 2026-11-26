import type { RecordInput } from '@heynixie/log';
import { buildProposeDeps, readProposal, writeSettlement } from '@heynixie/proposals';
import {
  conversationTaskID,
  readSettlementTarget,
  writeThreadRecordInTransaction,
} from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { readMergedThreads } from '../proposal/read-merged-threads';
import type { StoreParts } from '../types';
import type { PurgeFacts } from './read-purge-facts';

// Lapses each pending proposal of a purged item through the shared settlement, which closes its row
// and tells each proposer, as any other lapse does.
export async function writeProposalLapses(
  tx: Transaction<unknown>,
  parts: Pick<StoreParts, 'context'>,
  facts: Pick<PurgeFacts, 'pendingProposals'>,
): Promise<void> {
  const log = parts.context.log;

  const deps = {
    ...buildProposeDeps({
      log,
      clock: parts.context.gate.clock,
      definitions: parts.context.definitions,
    }),
    conversationThread: conversationTaskID,
    readSettlementTarget,
    writeThreadRecord: (writeTx: Transaction<unknown>, input: RecordInput) =>
      writeThreadRecordInTransaction(writeTx, { log }, input),
  };

  for (const proposal of facts.pendingProposals) {
    const row = await readProposal(tx, proposal.proposalID);

    if (row !== null) {
      await writeSettlement(deps, tx, {
        row,
        outcome: 'lapsed',
        answeredBy: null,
        usedBy: null,
        reason: null,
        detail: null,
        otherThreads: await readMergedThreads(tx, proposal.proposalID),
        byProposer: false,
      });
    }
  }
}
