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

  // The size of the device view's content area in device pixels, or null once the view closes. The
  // server learns it from a resize each time a stream opens and when the size changes, because a
  // stream that another tab opens must not replace it.
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

  // the size the last resize call gave the server since the stream opened, or null before one did
  resizedPixels: ScreenPixels | null;
  stopResizeTimer: (() => void) | null;
  isResizing: boolean;
  isOpen: boolean;

  // counts the streams that opened, so a call in flight knows a reconnect came before it settled
  openings: number;
}

// The tab's own device stream, held above every page so a route change keeps it open and the
// device is online whenever nixie is open. The device view reads what it holds.
export function createDeviceFeed(options: DeviceFeedOptions): DeviceFeed {
  const state: FeedState = {
    events: initialDeviceEvents,
    retained: 0,
    controller: null,
    viewPixels: null,
    resizedPixels: null,
    stopResizeTimer: null,
    isResizing: false,
    isOpen: false,
    openings: 0,
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

    if (state.isResizing || !state.isOpen || viewPixels === null) {
      return;
    }

    const pixels = pickPixelsToSend(state.resizedPixels, viewPixels);

    if (pixels === null) {
      return;
    }

    const openings = state.openings;

    state.isResizing = true;

    const isSent = await writeResize(options.client, pixels);

    state.isResizing = false;

    // a stream that opened while the call was in flight sends the size again
    if (isSent && state.openings === openings) {
      state.resizedPixels = pixels;
    }

    // a failed call leaves the old size, and the next change sends the size again
    if (isSent) {
      scheduleSize();
    }
  };

  const scheduleSize = (): void => {
    const isStale =
      state.isOpen &&
      state.viewPixels !== null &&
      pickPixelsToSend(state.resizedPixels, state.viewPixels) !== null;

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
      readPixels: () => state.viewPixels ?? readScreenPixels(),
      onConnection: (connection) => {
        if (state.controller !== controller) {
          return;
        }

        // a refusal means the session is gone, so the device keeps nothing it showed
        if (connection === 'refused') {
          state.isOpen = false;

          setEvents({ ...initialDeviceEvents, connection });

          return;
        }

        setEvents({ ...state.events, connection });

        if (connection !== 'open') {
          state.isOpen = false;

          return;
        }

        if (!state.isOpen) {
          state.isOpen = true;
          state.openings += 1;
          state.resizedPixels = null;
        }

        scheduleSize();
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
    state.isOpen = false;
    state.resizedPixels = null;
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
