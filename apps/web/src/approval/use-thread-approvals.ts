import { useQueries } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { LiveRecord } from '../conversation/use-live-records';
import { useNixieClient } from '../utils/use-nixie-client';
import { collectProposalIDBatches } from './collect-proposal-id-batches';
import { collectProposalIDs } from './collect-proposal-ids';
import type { ThreadApprovals } from './thread-approvals-context';
import { useDeferSettings } from './use-defer-settings';

// The state of every card in a thread, read for the proposals the records on screen created, in
// reads of at most the host's limit. The reads run again whenever a record arrives on the thread,
// so a card follows its row.
export function useThreadApprovals(records: readonly LiveRecord[]): ThreadApprovals {
  const nixie = useNixieClient();
  const defer = useDeferSettings();
  const ids = collectProposalIDs(records);
  const lastSequence = records.at(-1)?.sequence ?? 0;

  const read = useQueries({
    combine: (results) => ({
      proposals: results.flatMap((result) => result.data?.proposals ?? []),
      refetch: () => {
        for (const result of results) {
          void result.refetch();
        }
      },
    }),
    queries: collectProposalIDBatches(ids).map((proposalIDs) =>
      nixie.queryUtils.approvals.readProposals.queryOptions({ input: { proposalIDs } }),
    ),
  });

  const refetch = read.refetch;
  const seen = useRef(lastSequence);

  useEffect(() => {
    if (seen.current !== lastSequence) {
      seen.current = lastSequence;

      refetch();
    }
  }, [lastSequence, refetch]);

  return {
    reads: new Map(read.proposals.map((item) => [item.proposal.proposalID, item])),
    defer,
    refresh: refetch,
  };
}
