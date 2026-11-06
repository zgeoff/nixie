import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { hasTaskMessage } from './has-task-message';
import type { LiveRecord } from './use-live-records';
import { useNixieClient } from './use-nixie-client';

export interface EarlierRecordsRequest {
  readonly thread: string;
  readonly messageID: string | undefined;
  readonly page:
    | { readonly hasEarlier: boolean; readonly records: readonly LiveRecord[] }
    | undefined;
}

export interface EarlierRecords {
  readonly records: readonly LiveRecord[];
  readonly isFailed: boolean;

  readonly onRetry: () => void;
}

export function useEarlierRecords(request: EarlierRecordsRequest): EarlierRecords {
  const nixie = useNixieClient();
  const thread = request.thread;
  const messageID = request.messageID;
  const pageRecords = request.page?.records ?? [];
  const isInPage = messageID !== undefined && hasTaskMessage(pageRecords, messageID);
  const oldest = request.page?.hasEarlier === true ? pageRecords[0]?.sequence : undefined;
  const isLinked = messageID !== undefined && oldest !== undefined && !isInPage;

  const earlier = useInfiniteQuery({
    ...nixie.queryUtils.conversation.read.infiniteOptions({
      input: (beforeSequence: number) => ({ beforeSequence, thread }),
      initialPageParam: oldest ?? 0,
      getNextPageParam: (page) => (page.hasEarlier ? page.records[0]?.sequence : undefined),

      // A page read for one link holds text a later forget erases, so it leaves with the view.
      gcTime: 0,
    }),
    enabled: isLinked,

    // A failed page waits for the user's retry, so nothing else reads the thread again.
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const records = earlier.data?.pages.toReversed().flatMap((page) => page.records) ?? [];

  const isFound =
    messageID !== undefined && hasTaskMessage([...records, ...pageRecords], messageID);

  const hasNextPage = earlier.hasNextPage;
  const isFetching = earlier.isFetching;
  const fetchNextPage = earlier.fetchNextPage;
  const isFailed = earlier.isError;

  useEffect(() => {
    if (isLinked && !isFound && !isFailed && hasNextPage && !isFetching) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFailed, isFetching, isFound, isLinked]);

  return {
    records,
    isFailed,
    onRetry: () => {
      void (earlier.isFetchNextPageError ? fetchNextPage() : earlier.refetch());
    },
  };
}
