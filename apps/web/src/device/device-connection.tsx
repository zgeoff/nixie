import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useDeviceFeed } from './use-device-feed';

// Keeps the tab's own device stream open while a signed-in page shows, so the device is online
// whenever nixie is open.
export function DeviceConnection(): ReactNode {
  const feed = useDeviceFeed();

  useEffect(() => feed.retain(), [feed]);

  return null;
}
