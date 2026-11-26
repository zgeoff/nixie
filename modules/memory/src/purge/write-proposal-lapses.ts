import { writeRecordsInTransaction } from '@heynixie/log';
import { buildProposeDeps, readProposal, writeSettlement } from '@heynixie/proposals';
import { conversationTaskID, readSettlementTarget } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { readMergedThreads } from '../proposal/read-merged-threads';
import type { StoreParts } from '../types';
import type { PurgeFacts } from './read-purge-facts';

// Lapses each pending proposal of a purged item: its own record closes the memory side, and the
// shared settlement tells each proposer, as any other lapse does.
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
    readSettlementTarget: (_tx: Transaction<unknown>, thread: string) =>
      readSettlementTarget(tx, thread),
  };

  for (const proposal of facts.pendingProposals) {
    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.proposal_lapsed',
        definitions: parts.context.definitions(),
        ...(proposal.thread === null ? {} : { thread: proposal.thread }),
        payload: { proposalID: proposal.proposalID },
      },
    ]);

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
