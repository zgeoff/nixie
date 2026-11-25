import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { createLiveFeed } from './create-live-feed';
import { LiveFeedContext } from './live-feed-context';

export interface LiveProviderProps {
  readonly children: ReactNode;
  readonly startTimer?: StartTimer;
}

// Holds the tab's one live stream above every page, so a route change keeps it open. The stream
// opens once a signed-in page retains it.
export function LiveProvider(props: LiveProviderProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const startTimer = props.startTimer ?? startPlatformTimer;

  const [feed] = useState(() =>
    createLiveFeed({
      client: nixie.client,
      startTimer,
      invalidate: (topics) => {
        for (const topic of topics) {
          void readTopicAgain(queryClient, nixie.queryUtils[topic].key());
        }
      },
    }),
  );

  return <LiveFeedContext value={feed}>{props.children}</LiveFeedContext>;
}

// A read in flight may hold the state from before the change. A read that already has data is
// replaced by the new one, but a first read with no data yet is reused, so it is cancelled first.
async function readTopicAgain(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  await queryClient.cancelQueries({ queryKey });
  await queryClient.invalidateQueries({ queryKey });
}
