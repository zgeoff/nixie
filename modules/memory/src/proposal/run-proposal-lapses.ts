import { withWriteTransaction } from '@heynixie/log';
import type { ProposalLapse } from '../gate/gate-context';
import type { MemoryTables, StoreParts } from '../types';
import { removeClosedProposalKeys } from '../utils/key/remove-closed-proposal-keys';

// The shared sweep lapses a proposal. This one closes the keys of the proposals that closed.
export function runProposalLapses(parts: StoreParts): Promise<number> {
  return removeClosedProposalKeys(parts);
}

// Lapses one proposal that is still due, in a transaction of its own. A proposal that was answered
// or deferred in between stays as it is.
export async function writeProposalLapse(
  parts: StoreParts,
  lapse: ProposalLapse,
): Promise<boolean> {
  const log = parts.context.log;

  const isLapsed = await withWriteTransaction(log.writer, async (tx) => {
    const row = await tx
      .$extendTables<MemoryTables>()
      .selectFrom('memory_proposals')
      .select(['proposal_id'])
      .where('proposal_id', '=', lapse.proposalID)
      .where('status', '=', 'pending')
      .where('lapse_at', '<=', parts.context.gate.clock.now())
      .executeTakeFirst();

    if (row === undefined) {
      return false;
    }

    await lapse.writeInTransaction(tx);

    return true;
  });

  await removeClosedProposalKeys(parts);

  return isLapsed;
}
