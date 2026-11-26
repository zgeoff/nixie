import type { ReactNode } from 'react';
import { use, useEffect } from 'react';
import invariant from 'tiny-invariant';
import { DeviceLeaderContext } from './device-leader-context';

export function DeviceLeaderConnection(): ReactNode {
  const leader = use(DeviceLeaderContext);

  invariant(leader !== undefined, 'DeviceLeaderConnection needs a DeviceFeedProvider above it');
  useEffect(() => leader.retain(), [leader]);

  return null;
}
