import type { HarnessChannel } from '../start-harness-link';
import type { HarnessMessage, NixieMessage } from '../types';

export interface StubHarnessChannel {
  readonly channel: HarnessChannel;

  readonly sent: readonly NixieMessage[];

  readonly sendToLink: (message: HarnessMessage) => void;
}

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
