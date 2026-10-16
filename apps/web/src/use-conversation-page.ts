import type { ContractOutputs } from '@heynixie/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNixieClient } from './use-nixie-client';

// The newest page of a thread and the log sequence it was read at, kept current by the live stream
// while it shows. Leaving drops the page with the stream's records, so a page kept past them never
// shows a forgotten message's text again on the way back.
export function useConversationPage(thread: string) {
  const queryUtils = useNixieClient().queryUtils;
  const queryClient = useQueryClient();

  // the page this view dropped when its effect last stopped, when it was read, and its thread
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

    // StrictMode at mount and a hidden Activity stop and start the effect of a view that stays, so
    // that view puts back the page it dropped; a view that left never starts again
    if (kept?.thread === thread) {
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
