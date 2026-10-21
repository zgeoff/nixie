import type { ContractOutputs } from '@heynixie/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNixieClient } from './use-nixie-client';

export function useConversationPage(thread: string) {
  const queryUtils = useNixieClient().queryUtils;
  const queryClient = useQueryClient();

  const dropped = useRef<
    | {
        readonly page: ContractOutputs['conversation']['read'];
        readonly readAt: number;
        readonly thread: string;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const queryKey = queryUtils.conversation.read.queryKey({ input: { thread } });
    const kept = dropped.current;

    // React's StrictMode at mount and a hidden Activity stop and start the effect of a view that
    // stays, so the view puts back the page it dropped.
    if (kept?.thread === thread && queryClient.getQueryData(queryKey) === undefined) {
      queryClient.setQueryData(queryKey, kept.page, { updatedAt: kept.readAt });
    }

    dropped.current = undefined;

    return () => {
      const state = queryClient.getQueryState(queryKey);

      dropped.current =
        state?.data === undefined
          ? undefined
          : { page: state.data, readAt: state.dataUpdatedAt, thread };

      queryClient.removeQueries({ exact: true, queryKey });
    };
  }, [queryClient, queryUtils, thread]);

  return useQuery(
    queryUtils.conversation.read.queryOptions({
      input: { thread },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );
}
