import { useSyncExternalStore } from 'react';
import { useLiveFeed } from './use-live-feed';

// true while the stream cannot open, and each topic's reads run on a 60 s period instead
export function useLiveUnavailable(): boolean {
  const feed = useLiveFeed();

  return useSyncExternalStore(
    feed.subscribeToAvailability,
    () => !feed.isAvailable(),
    () => false,
  );
}
