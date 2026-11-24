import { useEffect } from 'react';
import { useLiveFeed } from './use-live-feed';

// Keeps the tab's live stream open while the calling page shows.
export function useLiveConnection(): void {
  const feed = useLiveFeed();

  useEffect(() => feed.retain(), [feed]);
}
