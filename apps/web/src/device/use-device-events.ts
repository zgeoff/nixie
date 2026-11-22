import type { DeviceEvent } from '@heynixie/contract';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';
import { subscribeToDeviceEvents } from './subscribe-to-device-events';

export interface DeviceEvents {
  // what the screen shows now, or null before the stream's first event
  readonly event: DeviceEvent | null;
  readonly connection: 'connecting' | 'open' | 'lost' | 'refused';
}

// Follows the device stream while the screen is on, and records in the ref the size each connect
// sends, because the server takes that size from the stream.
export function useDeviceEvents(
  isScreenOn: boolean,
  serverPixels: RefObject<ScreenPixels>,
): DeviceEvents {
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
      readPixels: () => {
        const pixels = readScreenPixels();

        serverPixels.current = pixels;

        return pixels;
      },
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
  }, [isScreenOn, nixie.client, serverPixels]);

  return events;
}
