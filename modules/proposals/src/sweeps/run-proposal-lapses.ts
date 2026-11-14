import { withWriteTransaction } from '@heynixie/log';
import type { ProposalCoreDeps } from '../answer/types';
import { readDueProposals } from './read-due-proposals';

// One sweep closes every kind's open rows that passed their lapse, through the kind's own lapse
// record. A row with no handler stays open, so the release that knows its kind closes it.
export function runProposalLapses(deps: ProposalCoreDeps): Promise<number> {
  return withWriteTransaction(deps.log.writer, async (tx) => {
    const due = await readDueProposals(tx, deps.clock.now());

    const counted = { lapsed: 0 };

    for (const row of due) {
      const handler = deps.handlers.get(row.family);

      if (handler !== undefined) {
        await handler.lapse(tx, row);

        counted.lapsed += 1;
      }
    }

    return counted.lapsed;
  });
}
