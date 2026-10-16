import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNixieClient } from './use-nixie-client';

// The newest page of a thread and the log sequence it was read at, kept current by the live stream
// while it shows. Leaving drops the page with the stream's records, so a page kept past them never
// shows a forgotten message's text again on the way back.
export function useConversationPage(thread: string) {
  const queryUtils = useNixieClient().queryUtils;
  const queryClient = useQueryClient();

  useEffect(
    () => () => {
      queryClient.removeQueries({
        exact: true,
        queryKey: queryUtils.conversation.read.queryKey({ input: { thread } }),
      });
    },
    [queryClient, queryUtils, thread],
  );

  return useQuery(
    queryUtils.conversation.read.queryOptions({
      input: { thread },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );
}
