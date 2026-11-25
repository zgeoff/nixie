import type { Clock } from '@heynixie/clock';
import type { ScreenPixels } from '../types';

// How long a device keeps its online state after its last stream closes, so a reconnect never
// reads as offline.
export const deviceOfflineGraceMs = 60_000;

export interface OpenDeviceStream {
  readonly close: () => void;
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

  // the size the device's newest open stream sent, or null while it holds no open stream
  readonly readPixels: (deviceID: string) => ScreenPixels | null;

  // gives every open stream of the device a new size, and does nothing while it is offline
  readonly resize: (deviceID: string, pixels: ScreenPixels) => void;

  // calls back on each change of a device to online or offline
  readonly subscribeToStatus: (onChange: (change: DeviceStatusChange) => void) => () => void;
}

interface HeldStream {
  pixels: ScreenPixels;
}

interface HeldDevice {
  streams: HeldStream[];
  isOnline: boolean;
  closedAtMs: number | null;
  grace: AbortController | null;
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
    open: (deviceID, pixels) => {
      const held = hold(deviceID);
      const stream: HeldStream = { pixels };

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
      };
    },
    isOnline: (deviceID) => devices.get(deviceID)?.isOnline ?? false,
    readOfflineSinceMs: (deviceID) => {
      const held = devices.get(deviceID);

      return held === undefined || held.isOnline ? null : held.closedAtMs;
    },
    readPixels: (deviceID) => devices.get(deviceID)?.streams.at(-1)?.pixels ?? null,
    resize: (deviceID, pixels) => {
      for (const stream of devices.get(deviceID)?.streams ?? []) {
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
