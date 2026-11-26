import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { createDeviceFeed } from './create-device-feed';
import { DeviceFeedContext } from './device-feed-context';

export interface DeviceFeedProviderProps {
  readonly children: ReactNode;
  readonly startTimer?: StartTimer;
}

// Holds the tab's own device stream above every page. The stream opens once a signed-in page
// retains it.
export function DeviceFeedProvider(props: DeviceFeedProviderProps): ReactNode {
  const nixie = useNixieClient();
  const startTimer = props.startTimer ?? startPlatformTimer;
  const [feed] = useState(() => createDeviceFeed({ client: nixie.client, startTimer }));

  return <DeviceFeedContext value={feed}>{props.children}</DeviceFeedContext>;
}
