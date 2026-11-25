import type { PageData } from '@heynixie/contract';

export interface PageMessage {
  readonly region: string;

  // the short ID of the content the message is for
  readonly shown: string;
  readonly data: PageData;

  // true for a message that the page's state keeps
  readonly retain: boolean;
}

export interface PageMessages {
  // Keeps a message as its region's state. The region holds the newest one only.
  readonly retain: (deviceID: string, message: PageMessage) => void;

  // The retained message of each region whose current content is the one it names. A region that
  // shows other content by now has none, so new content for a region drops its message.
  readonly readRetained: (
    deviceID: string,
    current: ReadonlyMap<string, string>,
  ) => readonly PageMessage[];
}

// The retained message of each page region, in memory only: a restart drops them, as it drops the
// open streams and the page errors.
export function createPageMessages(): PageMessages {
  const held = new Map<string, Map<string, PageMessage>>();

  return {
    retain: (deviceID, message) => {
      const regions = held.get(deviceID) ?? new Map<string, PageMessage>();

      regions.set(message.region, message);
      held.set(deviceID, regions);
    },
    readRetained: (deviceID, current) =>
      [...(held.get(deviceID)?.values() ?? [])].filter(
        (message) => current.get(message.region) === message.shown,
      ),
  };
}
