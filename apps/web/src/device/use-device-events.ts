import type { DeviceEvent } from '@heynixie/contract';
import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { applyDeviceEvent } from './apply-device-event';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';
import { subscribeToDeviceEvents } from './subscribe-to-device-events';

export type ScreenEvent = Exclude<DeviceEvent, { kind: 'layout' | 'message' | 'data' }>;

// a message that the assistant sent into a page, numbered in the order the stream sent it
export type PageDelivery = Extract<DeviceEvent, { kind: 'message' }> & { readonly id: number };

// a refresh of a declared fetch of a page, numbered in the order the stream sent it
export type PageDataNotice = Extract<DeviceEvent, { kind: 'data' }> & { readonly id: number };

export type DeviceLayout = Extract<DeviceEvent, { kind: 'layout' }>['layout'];

export interface DeviceEvents {
  // what the screen shows now, or null before the stream's first event
  readonly event: ScreenEvent | null;

  // the layout the device holds, which a show covers and the screen event leaves alone
  readonly layout: DeviceLayout;

  // each message since the stream opened, which a page takes when its frame is ready
  readonly messages: readonly PageDelivery[];

  // each refresh of a declared fetch since the stream opened, which a page hears as onData
  readonly notices: readonly PageDataNotice[];

  // the numbers of the newest message and refresh the stream sent, which survive the removal of
  // that message or refresh, so the next one never takes a number that a frame already heard
  readonly lastMessageID: number;
  readonly lastNoticeID: number;
  readonly connection: 'connecting' | 'open' | 'lost' | 'refused';
}

// Follows the device stream while the screen is on, and records in the ref the size each connect
// sends, because the server takes that size from the stream.
export function useDeviceEvents(
  isScreenOn: boolean,
  serverPixels: RefObject<ScreenPixels>,
): DeviceEvents {
  const nixie = useNixieClient();

  const [events, setEvents] = useState<DeviceEvents>({
    event: null,
    layout: null,
    messages: [],
    notices: [],
    lastMessageID: 0,
    lastNoticeID: 0,
    connection: 'connecting',
  });

  useEffect(() => {
    if (!isScreenOn) {
      return () => {};
    }

    const controller = new AbortController();

    setEvents({
      event: null,
      layout: null,
      messages: [],
      notices: [],
      lastMessageID: 0,
      lastNoticeID: 0,
      connection: 'connecting',
    });

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
        setEvents((current) => applyDeviceEvent(current, event));
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
