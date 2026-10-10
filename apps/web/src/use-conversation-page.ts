import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from './use-nixie-client';

// The newest page of a thread and the log sequence it was read at. The live stream keeps the page
// current from that sequence, so the page never goes stale and never refetches.
export function useConversationPage(thread: string) {
  const nixie = useNixieClient();

  return useQuery(
    nixie.queryUtils.conversation.read.queryOptions({
      input: { thread },
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );
}
