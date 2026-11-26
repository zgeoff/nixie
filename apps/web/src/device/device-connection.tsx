import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useDeviceFeed } from './use-device-feed';

export function DeviceConnection(): ReactNode {
  const feed = useDeviceFeed();

  useEffect(() => feed.retain(), [feed]);

  return null;
}
