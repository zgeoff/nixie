import { withWriteTransaction } from '@heynixie/log';
import type { ProposalCoreDeps } from '../answer/types';
import { proposalsReturnedCodec } from '../records/proposals-returned-codec';
import { readProposal } from '../rows/read-proposal';
import { readReturningProposals } from './read-returning-proposals';

// A deferred row comes back when its return time passes. The row is read again in the write
// transaction, so a row answered, lapsed or deferred again since comes back never.
export function runProposalReturns(deps: ProposalCoreDeps): Promise<number> {
  return withWriteTransaction(deps.log.writer, async (tx) => {
    const returning = await readReturningProposals(tx, deps.clock.now());

    const counted = { returned: 0 };

    for (const listed of returning) {
      const row = await readProposal(tx, listed.id);

      if (
        row === null ||
        row.state !== 'deferred' ||
        row.deferGeneration !== listed.deferGeneration ||
        row.lapsesAt <= deps.clock.now()
      ) {
        continue;
      }

      await deps.writeThreadRecord(tx, {
        kind: proposalsReturnedCodec.kind,
        definitions: deps.definitions(),
        ...(row.thread === null ? {} : { thread: row.thread }),
        payload: proposalsReturnedCodec.encode({
          proposalID: row.id,
          shortID: row.shortID,
          generation: row.deferGeneration,
        }),
      });

      counted.returned += 1;
    }

    return counted.returned;
  });
}
