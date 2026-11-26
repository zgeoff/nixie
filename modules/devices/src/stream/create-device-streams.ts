import type { Clock } from '@heynixie/clock';
import type { ScreenPixels } from '../types';
import type { PageErrors } from './create-page-errors';
import { createPageErrors } from './create-page-errors';
import type { PageEventLimits } from './create-page-event-limits';
import { createPageEventLimits } from './create-page-event-limits';
import type { PageFetches } from './create-page-fetches';
import { createPageFetches } from './create-page-fetches';
import type { PageMessage, PageMessages } from './create-page-messages';
import { createPageMessages } from './create-page-messages';
import type { PageTickets } from './create-page-tickets';
import { createPageTickets } from './create-page-tickets';

// How long a device keeps its online state after its last stream closes, so a reconnect never
// reads as offline.
export const deviceOfflineGraceMs = 60_000;

// A refresh of a declared fetch, which the device hands to the page that declared it.
interface DataNotice {
  readonly region: string;

  // the short ID of the content that declared the fetch
  readonly shown: string;
  readonly url: string;
}

export interface OpenDeviceStream {
  readonly close: () => void;

  // the refreshes that arrived since the last read, oldest first
  readonly readNotices: () => readonly DataNotice[];

  // the messages that arrived since the last read, oldest first
  readonly readMessages: () => readonly PageMessage[];

  // resolves when a message is waiting, or when the signal aborts
  readonly waitForMessage: (signal: AbortSignal) => Promise<void>;
}

export interface DeviceStatusChange {
  readonly deviceID: string;
  readonly status: 'online' | 'offline';
  readonly atMs: number;
}

export interface DeviceStreams {
  readonly open: (deviceID: string, pixels: ScreenPixels) => OpenDeviceStream;

  // true while the device has an open stream, and for 60 s after its last one closed
  readonly isOnline: (deviceID: string) => boolean;

  // when the device's last stream closed, or null while it is online or has had none since the
  // process started
  readonly readOfflineSinceMs: (deviceID: string) => number | null;

  // The size the device's newest open stream sent, unless a resize came after the streams that are
  // open opened, which keeps its size against a stream that another tab opens. Null while the device
  // holds no open stream.
  readonly readPixels: (deviceID: string) => ScreenPixels | null;

  // gives every open stream of the device a new size, and does nothing while it is offline
  readonly resize: (deviceID: string, pixels: ScreenPixels) => void;

  // the last errors that each device's regions reported
  readonly errors: PageErrors;

  // the tickets that each page region's frame and images load by
  readonly tickets: PageTickets;

  // the retained message of each page region
  readonly messages: PageMessages;

  // the limits on the events of each page region
  readonly eventLimits: PageEventLimits;

  // the fetches that each page region declares, and what they returned
  readonly fetches: PageFetches;

  // Tells each open stream of the device that a declared fetch refreshed, and does nothing while
  // the device is offline.
  readonly sendNotice: (deviceID: string, notice: DataNotice) => void;

  // Hands a message to each open stream of the device, and returns whether it has one. A message to
  // an offline device reaches no stream.
  readonly sendMessage: (deviceID: string, message: PageMessage) => boolean;

  // calls back on each change of a device to online or offline
  readonly subscribeToStatus: (onChange: (change: DeviceStatusChange) => void) => () => void;
}

interface HeldStream {
  pixels: ScreenPixels;
  queue: PageMessage[];
  notices: DataNotice[];
  wakers: Set<() => void>;
}

interface HeldDevice {
  streams: HeldStream[];
  isOnline: boolean;
  closedAtMs: number | null;
  grace: AbortController | null;

  // the size of the last resize while a stream stayed open, or null
  resized: ScreenPixels | null;
}

export interface DeviceStreamsOptions {
  readonly clock: Clock;
}

// The open streams of each device, which only this process knows: a restart drops them, and each
// device opens its stream again.
export function createDeviceStreams(options: DeviceStreamsOptions): DeviceStreams {
  const devices = new Map<string, HeldDevice>();
  const listeners = new Set<(change: DeviceStatusChange) => void>();

  const emit = (deviceID: string, status: DeviceStatusChange['status']): void => {
    for (const listener of listeners) {
      listener({ deviceID, status, atMs: options.clock.now() });
    }
  };

  const hold = (deviceID: string): HeldDevice => {
    const held = devices.get(deviceID) ?? {
      streams: [],
      isOnline: false,
      closedAtMs: null,
      grace: null,
      resized: null,
    };

    devices.set(deviceID, held);

    return held;
  };

  const close = (deviceID: string, stream: HeldStream): void => {
    const held = hold(deviceID);

    held.streams = held.streams.filter((open) => open !== stream);

    if (held.streams.length > 0) {
      return;
    }

    held.closedAtMs = options.clock.now();
    held.resized = null;

    const grace = new AbortController();

    held.grace = grace;
    void runGrace(deviceID, held, grace.signal);
  };

  // The device turns offline once the grace runs out, unless a new stream cancels it first.
  const runGrace = async (
    deviceID: string,
    held: HeldDevice,
    signal: AbortSignal,
  ): Promise<void> => {
    try {
      await options.clock.sleep(deviceOfflineGraceMs, signal);
    } catch {
      return;
    }

    if (signal.aborted) {
      return;
    }

    held.grace = null;
    held.isOnline = false;

    emit(deviceID, 'offline');
  };

  return {
    errors: createPageErrors(),
    tickets: createPageTickets(),
    messages: createPageMessages(),
    eventLimits: createPageEventLimits(),
    fetches: createPageFetches(),
    sendNotice: (deviceID, notice) => {
      for (const stream of devices.get(deviceID)?.streams ?? []) {
        stream.notices.push(notice);

        for (const wake of stream.wakers) {
          wake();
        }
      }
    },
    sendMessage: (deviceID, message) => {
      const streams = devices.get(deviceID)?.streams ?? [];

      for (const stream of streams) {
        stream.queue.push(message);

        for (const wake of stream.wakers) {
          wake();
        }
      }

      return streams.length > 0;
    },
    open: (deviceID, pixels) => {
      const held = hold(deviceID);
      const stream: HeldStream = { pixels, queue: [], notices: [], wakers: new Set() };

      held.grace?.abort();
      held.grace = null;
      held.closedAtMs = null;
      held.streams = [...held.streams, stream];

      if (!held.isOnline) {
        held.isOnline = true;

        emit(deviceID, 'online');
      }

      return {
        close: () => {
          close(deviceID, stream);
        },
        readMessages: () => stream.queue.splice(0),
        readNotices: () => stream.notices.splice(0),
        waitForMessage: (signal) =>
          new Promise<void>((resolve) => {
            if (stream.queue.length > 0 || stream.notices.length > 0 || signal.aborted) {
              resolve();

              return;
            }

            const wake = (): void => {
              stream.wakers.delete(wake);
              signal.removeEventListener('abort', wake);

              resolve();
            };

            stream.wakers.add(wake);
            signal.addEventListener('abort', wake, { once: true });
          }),
      };
    },
    isOnline: (deviceID) => devices.get(deviceID)?.isOnline ?? false,
    readOfflineSinceMs: (deviceID) => {
      const held = devices.get(deviceID);

      return held === undefined || held.isOnline ? null : held.closedAtMs;
    },
    readPixels: (deviceID) => {
      const held = devices.get(deviceID);

      return held?.resized ?? held?.streams.at(-1)?.pixels ?? null;
    },
    resize: (deviceID, pixels) => {
      const held = devices.get(deviceID);

      if (held === undefined || held.streams.length === 0) {
        return;
      }

      held.resized = pixels;

      for (const stream of held.streams) {
        stream.pixels = pixels;
      }
    },
    subscribeToStatus: (onChange) => {
      listeners.add(onChange);

      return () => {
        listeners.delete(onChange);
      };
    },
  };
}
