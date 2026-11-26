import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { DeferSettings } from '../approval/build-defer-times';
import { useDeferSettings } from '../approval/use-defer-settings';
import type { ApprovalRead } from '../types';
import { useNixieClient } from '../utils/use-nixie-client';
import { collectCallProposalIDs } from './collect-call-proposal-ids';

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
  const listed = useQuery(nixie.queryUtils.approvals.listItems.queryOptions());
  const [seenIDs, setSeenIDs] = useState<readonly string[]>([]);
  const items = listed.data?.items;

  useEffect(() => {
    if (items !== undefined && thread !== null) {
      setSeenIDs((previous) => collectCallProposalIDs(previous, items, thread));
    }
  }, [items, thread]);

  const read = useQuery({
    ...nixie.queryUtils.approvals.readProposals.queryOptions({
      input: { proposalIDs: [...seenIDs] },
    }),
    enabled: seenIDs.length > 0,
  });

  const refetchList = listed.refetch;
  const refetchRead = read.refetch;

  return {
    items: read.data?.proposals ?? [],
    defer,
    refresh: () => {
      void refetchList();
      void refetchRead();
    },
  };
}
