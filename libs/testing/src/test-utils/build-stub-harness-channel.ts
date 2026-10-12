import type { HarnessChannel } from '../start-harness-link';
import type { HarnessMessage, NixieMessage } from '../types';

export interface StubHarnessChannel {
  readonly channel: HarnessChannel;

  // every message nixie sent, in order
  readonly sent: readonly NixieMessage[];

  // delivers a message from the harness to every listener, as Bun's message event does
  readonly sendToLink: (message: HarnessMessage) => void;
}

// An in-memory stand-in for the IPC channel between nixie and the crash harness, so a test drives
// a harness link without a child process.
export function buildStubHarnessChannel(): StubHarnessChannel {
  const sent: NixieMessage[] = [];
  const listeners: ((message: HarnessMessage) => void)[] = [];

  return {
    channel: {
      send: (message) => {
        sent.push(message);
      },
      subscribe: (onMessage) => {
        listeners.push(onMessage);
      },
    },
    sent,
    sendToLink: (message) => {
      for (const listener of listeners) {
        listener(message);
      }
    },
  };
}
