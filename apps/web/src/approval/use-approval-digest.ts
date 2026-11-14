import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNixieClient } from '../utils/use-nixie-client';
import type { DeferSettings } from './build-defer-times';
import type { SeenApproval } from './merge-seen-approvals';
import { applyApprovalReads, mergeSeenApprovals } from './merge-seen-approvals';

export interface ApprovalDigestState {
  readonly status: 'pending' | 'failed' | 'ready';
  readonly entries: readonly SeenApproval[];
  readonly defer: DeferSettings | null;
  readonly refresh: () => void;
}

const refreshIntervalMs = 15_000;

// Everything that waits for an answer. The list reads again on focus, when the page shows again and
// every 15 seconds. A row that leaves the list stays, read again for its outcome and the device
// that answered it, so its line collapses to that state.
export function useApprovalDigest(): ApprovalDigestState {
  const nixie = useNixieClient();

  const listed = useQuery({
    ...nixie.queryUtils.approvals.listItems.queryOptions(),
    refetchInterval: refreshIntervalMs,
    refetchOnWindowFocus: false,
  });

  const [seen, setSeen] = useState<readonly SeenApproval[]>([]);
  const items = listed.data?.items;
  const merged = useMemo(() => mergeSeenApprovals(seen, items ?? []), [seen, items]);

  useEffect(() => {
    if (items !== undefined) {
      setSeen((previous) => mergeSeenApprovals(previous, items));
    }
  }, [items]);

  const listedIDs = new Set((items ?? []).map((item) => item.proposal.proposalID));

  const departedIDs = merged
    .filter((entry) => !listedIDs.has(entry.proposalID))
    .map((entry) => entry.proposalID);

  const read = useQuery({
    ...nixie.queryUtils.approvals.readProposals.queryOptions({
      input: { proposalIDs: departedIDs },
    }),
    enabled: departedIDs.length > 0,
  });

  const refetchList = listed.refetch;
  const refetchRead = read.refetch;

  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === 'visible') {
        void refetchList();
        void refetchRead();
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refetchList, refetchRead]);

  const entries = applyApprovalReads(merged, read.data?.proposals ?? []);

  return {
    status: pickStatus(listed),
    entries,
    defer: listed.data?.defer ?? null,
    refresh: () => {
      void refetchList();

      if (departedIDs.length > 0) {
        void refetchRead();
      }
    },
  };
}

interface ListedState {
  readonly data: unknown;
  readonly isError: boolean;
}

function pickStatus(listed: ListedState): ApprovalDigestState['status'] {
  if (listed.data !== undefined) {
    return 'ready';
  }

  return listed.isError ? 'failed' : 'pending';
}
