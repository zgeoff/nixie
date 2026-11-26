import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { holdDeviceStreamAsLeader } from './hold-device-stream-as-leader';
import { useDeviceFeed } from './use-device-feed';

export function DeviceLeaderConnection(): ReactNode {
  const feed = useDeviceFeed();

  useEffect(() => holdDeviceStreamAsLeader(feed, globalThis.navigator.locks), [feed]);

  return null;
}
