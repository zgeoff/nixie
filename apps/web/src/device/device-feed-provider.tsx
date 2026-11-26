import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { createDeviceFeed } from './create-device-feed';
import { createDeviceLeader } from './create-device-leader';
import { DeviceFeedContext } from './device-feed-context';
import { DeviceLeaderContext } from './device-leader-context';
import { holdDeviceStreamInBrowser } from './hold-device-stream-in-browser';

export interface DeviceFeedProviderProps {
  readonly children: ReactNode;
  readonly startTimer?: StartTimer;
}

export function DeviceFeedProvider(props: DeviceFeedProviderProps): ReactNode {
  const nixie = useNixieClient();
  const startTimer = props.startTimer ?? startPlatformTimer;
  const [feed] = useState(() => createDeviceFeed({ client: nixie.client, startTimer }));
  const [leader] = useState(() => createDeviceLeader(() => holdDeviceStreamInBrowser(feed)));

  return (
    <DeviceFeedContext value={feed}>
      <DeviceLeaderContext value={leader}>{props.children}</DeviceLeaderContext>
    </DeviceFeedContext>
  );
}
