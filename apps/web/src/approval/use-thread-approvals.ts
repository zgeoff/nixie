import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { LiveRecord } from '../conversation/use-live-records';
import { useNixieClient } from '../utils/use-nixie-client';
import { collectProposalIDs } from './collect-proposal-ids';
import type { ThreadApprovals } from './thread-approvals-context';
import { useDeferSettings } from './use-defer-settings';

// The state of every card in a thread, in one read of the proposals the records on screen created.
// The read runs again whenever a record arrives on the thread, so a card follows its row.
export function useThreadApprovals(records: readonly LiveRecord[]): ThreadApprovals {
  const nixie = useNixieClient();
  const defer = useDeferSettings();
  const ids = collectProposalIDs(records);
  const lastSequence = records.at(-1)?.sequence ?? 0;

  const read = useQuery({
    ...nixie.queryUtils.approvals.readProposals.queryOptions({ input: { proposalIDs: [...ids] } }),
    enabled: ids.length > 0,
  });

  const refetch = read.refetch;
  const seen = useRef(lastSequence);

  useEffect(() => {
    if (seen.current !== lastSequence) {
      seen.current = lastSequence;

      if (ids.length > 0) {
        void refetch();
      }
    }
  }, [ids.length, lastSequence, refetch]);

  return {
    reads: new Map((read.data?.proposals ?? []).map((item) => [item.proposal.proposalID, item])),
    defer,
    refresh: () => {
      void refetch();
    },
  };
}
