import type { Clock } from '@heynixie/clock';
import type { DeviceStreams } from '@heynixie/devices';
import { createDeviceStreams } from '@heynixie/devices';

export interface Presence {
  // true while any session's newest sessions.shown lies within withinMs
  readonly isPresent: (withinMs: number) => boolean;
}

export interface ClientRegistry {
  // read by the push notifier
  readonly presence: Presence;

  // read by the devices module; a device is online while one of its device streams is open
  readonly devices: DeviceStreams;

  // notes that a session shows nixie on screen now
  readonly recordShown: (sessionID: string) => void;
}

export interface ClientRegistryOptions {
  readonly clock: Clock;
}

// In memory: a restart forgets it, and each client calls and opens again. An open stream never
// counts as presence, and only a sessions.shown beat does.
export function createClientRegistry(options: ClientRegistryOptions): ClientRegistry {
  const shownAtMs = new Map<string, number>();

  return {
    presence: {
      isPresent: (withinMs) =>
        shownAtMs.values().some((atMs) => options.clock.now() - atMs <= withinMs),
    },
    devices: createDeviceStreams({ clock: options.clock }),
    recordShown: (sessionID) => {
      shownAtMs.set(sessionID, options.clock.now());
    },
  };
}
