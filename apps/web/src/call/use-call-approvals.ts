import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { DeferSettings } from '../approval/build-defer-times';
import { useDeferSettings } from '../approval/use-defer-settings';
import type { ApprovalRead } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { useCall } from './call-context';
import { collectCallProposalIDs } from './collect-call-proposal-ids';

// the most proposals one read takes
const readLimit = 100;

export interface CallApprovals {
  readonly items: readonly ApprovalRead[];
  readonly defer: DeferSettings;
  readonly refresh: () => void;
}

// The cards of the proposals that the call's own thread made. The list reads again on the live
// stream's `approvals` topic. A proposal that leaves the list after an answer stays, read again for
// its outcome, so its card shows what became of it.
export function useCallApprovals(thread: string | null): CallApprovals {
  const nixie = useNixieClient();
  const defer = useDeferSettings();
  const call = useCall();
  const listed = useQuery(nixie.queryUtils.approvals.listItems.queryOptions());
  const items = listed.data?.items;
  const seen = call.seenProposals;
  const setSeen = call.setSeenProposals;

  // the IDs of an earlier call are not this call's
  const seenIDs = seen.thread === thread ? seen.ids : [];

  useEffect(() => {
    if (items !== undefined && thread !== null) {
      const next = collectCallProposalIDs(seenIDs, items, thread);

      if (seen.thread !== thread || next.join(',') !== seenIDs.join(',')) {
        setSeen({ thread, ids: next });
      }
    }
  }, [items, thread, seen.thread, seenIDs, setSeen]);

  // one read takes at most a hundred proposals
  const reads = useQueries({
    queries: chunk(seenIDs, readLimit).map((proposalIDs) =>
      nixie.queryUtils.approvals.readProposals.queryOptions({ input: { proposalIDs } }),
    ),
  });

  const refetchList = listed.refetch;

  return {
    items: reads.flatMap((read) => read.data?.proposals ?? []),
    defer,
    refresh: () => {
      void refetchList();

      for (const read of reads) {
        void read.refetch();
      }
    },
  };
}

function chunk(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];

  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size));
  }

  return chunks;
}
