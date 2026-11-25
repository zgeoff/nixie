import { use } from 'react';
import type { LiveFeed } from './create-live-feed';
import { LiveFeedContext } from './live-feed-context';

export function useLiveFeed(): LiveFeed {
  const feed = use(LiveFeedContext);

  if (feed === undefined) {
    throw new Error('useLiveFeed needs a LiveProvider above it');
  }

  return feed;
}
