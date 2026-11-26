import { buildShortIDFromUUID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import { proposalsSettledCodec } from '@heynixie/proposals';
import type { MemorySeederDeps } from './memory-seeder-deps';

// Lapses one due proposal as the shared sweep does: memory's own row moves, and the settlement is
// written in the same transaction.
export function lapseTestProposal(
  deps: Pick<MemorySeederDeps, 'store' | 'log'>,
  proposalID: string,
): Promise<boolean> {
  return deps.store.proposals.lapseProposal({
    proposalID,
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, deps.log, [
        {
          kind: proposalsSettledCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          payload: proposalsSettledCodec.encode({
            proposalID,
            shortID: buildShortIDFromUUID(proposalID),
            family: 'memory',
            outcome: 'lapsed',
            answeredBy: null,
            usedBy: null,
            detail: null,
            task: null,
            replaced: null,
            byProposer: false,
          }),
        },
      ]);
    },
  });
}
