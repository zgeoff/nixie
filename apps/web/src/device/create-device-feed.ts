import type { ContractClient } from '@heynixie/contract';
import type { StartTimer } from '../utils/start-platform-timer';
import { applyDeviceEvent } from './apply-device-event';
import { initialDeviceEvents } from './initial-device-events';
import { pickPixelsToSend } from './pick-pixels-to-send';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';
import { subscribeToDeviceEvents } from './subscribe-to-device-events';
import type { DeviceEvents } from './types';

export interface DeviceFeed {
  readonly retain: () => () => void;
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => DeviceEvents;

  // The size of the device view's content area in device pixels, or null once the view closes. The
  // server learns it from a resize each time a stream opens and when the size changes, because a
  // stream that another tab opens must not replace it.
  readonly setViewPixels: (pixels: ScreenPixels | null) => void;

  // Shows what another tab's device stream shows, while this tab holds none of its own. A refusal
  // drops what the screen showed, as a refusal of this tab's own stream does.
  readonly mirror: (events: DeviceEvents) => void;
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

  resizedPixels: ScreenPixels | null;
  stopResizeTimer: (() => void) | null;
  isResizing: boolean;
  isOpen: boolean;

  // counts the streams that opened, so a call in flight knows a reconnect came before it settled
  openings: number;
}

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

    if (isSent) {
      scheduleSize();
    }
  };

  const scheduleSize = (): void => {
    const isStale =
      state.isOpen &&
      state.viewPixels !== null &&
      pickPixelsToSend(state.resizedPixels, state.viewPixels) !== null;

    if (isStale && state.stopResizeTimer === null) {
      state.stopResizeTimer = options.startTimer(() => {
        void sendSize();
      }, resizeDelayMs);
    }
  };

  const start = (): void => {
    const controller = new AbortController();

    state.controller = controller;

    // a stream that another tab held may have been open, and this one sends its size again
    state.isOpen = false;

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
    mirror: (events) => {
      if (state.controller !== null) {
        return;
      }

      const isOpen = events.connection === 'open';

      if (isOpen && !state.isOpen) {
        state.openings += 1;
        state.resizedPixels = null;
      }

      state.isOpen = isOpen;

      const shown: DeviceEvents =
        events.connection === 'refused'
          ? { ...initialDeviceEvents, connection: 'refused' }
          : events;

      setEvents(shown);
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
