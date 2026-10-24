import type { StubGuestScript } from '@heynixie/sandbox/test-utils';
import type { InboxMessage } from '@heynixie/wire';

export interface StubLiveTurn {
  readonly script: StubGuestScript;

  readonly received: readonly InboxMessage[];
}

export function buildStubLiveTurnScript(arrive: () => Promise<unknown>): StubLiveTurn {
  const received: InboxMessage[] = [];

  return {
    received,
    script: async (turn, guest) => {
      await arrive();

      const message = await guest.waitForMessage();

      received.push(message);

      return [
        { type: 'read', uuids: [...turn.input.map((input) => input.uuid), message.uuid] },
        {
          type: 'ended',
          boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
          subtype: 'success',
          stopReason: 'end_turn',
          turns: 1,
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      ];
    },
  };
}
