import type { ContractClient } from '@heynixie/contract';
import type { StartTimer } from '../utils/start-platform-timer';
import { applyDeviceEvent } from './apply-device-event';
import { initialDeviceEvents } from './initial-device-events';
import { pickPixelsToSend } from './pick-pixels-to-send';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';
import { subscribeToDeviceEvents } from './subscribe-to-device-events';
import type { DeviceEvents } from './use-device-events';

export interface DeviceFeed {
  // keeps the device stream open until the returned function runs
  readonly retain: () => () => void;
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => DeviceEvents;

  // The size of the device view's content area in device pixels, or null once the view closes.
  // The server learns it from the next stream that opens, or from a resize while one is open.
  readonly setViewPixels: (pixels: ScreenPixels | null) => void;
}

export interface DeviceFeedOptions {
  readonly client: ContractClient;
  readonly startTimer: StartTimer;
}

const resizeDelayMs = 250;

interface FeedState {
  events: DeviceEvents;
  retained: number;
  controller: AbortController | null;
  viewPixels: ScreenPixels | null;

  // the size the server holds for the open stream, or null while none is open
  serverPixels: ScreenPixels | null;
  stopResizeTimer: (() => void) | null;
  isResizing: boolean;
}

// The tab's own device stream, held above every page so a route change keeps it open and the
// device is online whenever nixie is open. The device view reads what it holds.
export function createDeviceFeed(options: DeviceFeedOptions): DeviceFeed {
  const state: FeedState = {
    events: initialDeviceEvents,
    retained: 0,
    controller: null,
    viewPixels: null,
    serverPixels: null,
    stopResizeTimer: null,
    isResizing: false,
  };

  const listeners = new Set<() => void>();

  const setEvents = (events: DeviceEvents): void => {
    state.events = events;

    for (const listener of listeners) {
      listener();
    }
  };

  const sendSize = async (): Promise<void> => {
    state.stopResizeTimer = null;

    const viewPixels = state.viewPixels;
    const sent = state.serverPixels;

    if (state.isResizing || viewPixels === null || sent === null) {
      return;
    }

    const pixels = pickPixelsToSend(sent, viewPixels);

    if (pixels === null) {
      return;
    }

    state.isResizing = true;

    const isSent = await writeResize(options.client, pixels);

    state.isResizing = false;

    // a reconnect while the call was in flight sent its own size, which is what the server keeps
    if (isSent && state.serverPixels === sent) {
      state.serverPixels = pixels;
    }

    // a failed call leaves the old size, and the next change sends the size again
    if (isSent) {
      scheduleSize();
    }
  };

  const scheduleSize = (): void => {
    const isStale =
      state.serverPixels !== null &&
      state.viewPixels !== null &&
      pickPixelsToSend(state.serverPixels, state.viewPixels) !== null;

    if (isStale && state.stopResizeTimer === null && state.controller !== null) {
      state.stopResizeTimer = options.startTimer(() => {
        void sendSize();
      }, resizeDelayMs);
    }
  };

  const start = (): void => {
    const controller = new AbortController();

    state.controller = controller;

    void subscribeToDeviceEvents({
      client: options.client,
      readPixels: () => {
        const pixels = state.viewPixels ?? readScreenPixels();

        state.serverPixels = pixels;

        return pixels;
      },
      onConnection: (connection) => {
        if (state.controller !== controller) {
          return;
        }

        setEvents({ ...state.events, connection });

        if (connection === 'open') {
          scheduleSize();
        }
      },
      onEvent: (event) => {
        if (state.controller !== controller) {
          return;
        }

        setEvents(applyDeviceEvent(state.events, event));
      },
      signal: controller.signal,
      startTimer: options.startTimer,
    });
  };

  const stop = (): void => {
    state.controller?.abort();
    state.controller = null;
    state.serverPixels = null;
    state.stopResizeTimer?.();
    state.stopResizeTimer = null;

    setEvents(initialDeviceEvents);
  };

  return {
    retain: () => {
      state.retained += 1;

      if (state.controller === null) {
        start();
      }

      let isReleased = false;

      return () => {
        if (isReleased) {
          return;
        }

        isReleased = true;
        state.retained -= 1;

        // a route change drops one page and mounts the next in one step, which keeps the stream
        queueMicrotask(() => {
          if (state.retained === 0 && state.controller !== null) {
            stop();
          }
        });
      };
    },
    subscribe: (onChange) => {
      listeners.add(onChange);

      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => state.events,
    setViewPixels: (pixels) => {
      state.viewPixels = pixels;

      scheduleSize();
    },
  };
}

async function writeResize(client: ContractClient, pixels: ScreenPixels): Promise<boolean> {
  try {
    await client.devices.resize(pixels);

    return true;
  } catch {
    return false;
  }
}
