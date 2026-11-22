import type { DeviceEvent } from '@heynixie/contract';
import { useEffect, useState } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { readScreenPixels } from './read-screen-pixels';
import { subscribeToDeviceEvents } from './subscribe-to-device-events';

export interface DeviceEvents {
  // what the screen shows now, or null before the stream's first event
  readonly event: DeviceEvent | null;
  readonly connection: 'connecting' | 'open' | 'lost' | 'refused';
}

// Follows the device stream while the screen is on.
export function useDeviceEvents(isScreenOn: boolean): DeviceEvents {
  const nixie = useNixieClient();
  const [events, setEvents] = useState<DeviceEvents>({ event: null, connection: 'connecting' });

  useEffect(() => {
    if (!isScreenOn) {
      return () => {};
    }

    const controller = new AbortController();

    setEvents({ event: null, connection: 'connecting' });

    void subscribeToDeviceEvents({
      client: nixie.client,
      readPixels: readScreenPixels,
      onConnection: (connection) => {
        setEvents((current) => ({ ...current, connection }));
      },
      onEvent: (event) => {
        setEvents((current) => ({ ...current, event }));
      },
      signal: controller.signal,
      startTimer: startPlatformTimer,
    });

    return () => {
      controller.abort();
    };
  }, [isScreenOn, nixie.client]);

  return events;
}
