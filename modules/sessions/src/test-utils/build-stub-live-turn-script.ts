import type { StubGuestScript } from '@heynixie/sandbox/test-utils';
import type { InboxMessage } from '@heynixie/wire';

export interface StubLiveTurn {
  readonly script: StubGuestScript;

  readonly received: readonly InboxMessage[];

  // the uuids of the received messages whose frame cut the call in flight
  readonly cutting: readonly string[];
}

export interface StubLiveTurnOptions {
  // how many live messages the turn waits for, one by default
  readonly messages?: number;
}

export function buildStubLiveTurnScript(
  arrive: () => Promise<unknown>,
  options: StubLiveTurnOptions = {},
): StubLiveTurn {
  const received: InboxMessage[] = [];
  const cutting: string[] = [];

  return {
    received,
    cutting,
    script: async (turn, guest) => {
      await arrive();

      for (let count = options.messages ?? 1; count > 0; count -= 1) {
        const message = await guest.waitForMessage();

        received.push(message);

        if (guest.isCutting?.(message.uuid) === true) {
          cutting.push(message.uuid);
        }
      }

      return [
        {
          type: 'read',
          uuids: [
            ...turn.input.map((input) => input.uuid),
            ...received.map((message) => message.uuid),
          ],
        },
        {
          type: 'ended',
          boundary: {
            harness: 'agent-sdk',
            sessionID: crypto.randomUUID(),
            messageID: crypto.randomUUID(),
          },
          outcome: 'finished',
          stopReason: 'end_turn',
          turns: 1,
          usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
          ...(cutting.length === 0 ? {} : { cutCalls: 1 }),
        },
      ];
    },
  };
}
