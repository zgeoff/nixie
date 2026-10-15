import type { StubGuestScript } from '@heynixie/sandbox/test-utils';
import type { GuestFrame, HostFrame, SessionPoint } from '@heynixie/wire';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

// How one stub turn ends: at a fixed chain entry or a fresh one, with a reply or none, with the
// context of its last model call in a 200,000-token window or none, and with the SDK's reason for
// the end. An overflow reason marks the end as an error, as the guest reports it.
export interface StubTurnEnd {
  readonly boundary?: SessionPoint;
  readonly reply?: string;
  readonly contextSize?: number;
  readonly terminalReason?: string;
}

const overflowReasons = new Set(['blocking_limit', 'prompt_too_long']);

// Builds a stub guest script that reads every inbox message, then ends each turn as pick says for
// that turn's frame.
export function buildStubTurnScript(pick: (turn: TurnFrame) => StubTurnEnd): StubGuestScript {
  return (turn) => {
    const end = pick(turn);
    const isOverflow = end.terminalReason !== undefined && overflowReasons.has(end.terminalReason);

    const frames: GuestFrame[] = [
      { type: 'read', uuids: turn.input.map((message) => message.uuid) },
      ...(end.reply === undefined
        ? []
        : [
            {
              type: 'assistant' as const,
              messageID: crypto.randomUUID(),
              text: end.reply,
              toolUses: [],
            },
          ]),
      {
        type: 'ended',
        boundary: end.boundary ?? {
          sessionID: crypto.randomUUID(),
          messageID: crypto.randomUUID(),
        },
        subtype: 'success',
        stopReason: isOverflow ? 'stop_sequence' : 'end_turn',
        ...(isOverflow ? { isError: true } : {}),
        ...(end.terminalReason === undefined ? {} : { terminalReason: end.terminalReason }),
        turns: 1,
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        ...(end.contextSize === undefined
          ? {}
          : { context: { size: end.contextSize, window: 200_000 } }),
      },
    ];

    return frames;
  };
}
