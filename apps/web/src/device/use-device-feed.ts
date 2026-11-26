import { use } from 'react';
import type { DeviceFeed } from './create-device-feed';
import { DeviceFeedContext } from './device-feed-context';

export function useDeviceFeed(): DeviceFeed {
  const feed = use(DeviceFeedContext);

  if (feed === undefined) {
    throw new Error('useDeviceFeed needs a DeviceFeedProvider above it');
  }

  return feed;
}
