import { isDeepStrictEqual } from 'node:util';
import type { StubGuestScript } from '@heynixie/sandbox/test-utils';
import type { GuestFrame, ModelAPIErrorKind, SessionPoint } from '@heynixie/wire';

export type StubSessionOutcome =
  | { readonly refusal: ModelAPIErrorKind; readonly detail: string }
  | { readonly reply: string };

// Keeps one session: it answers a turn only when the turn resumes at the boundary of the last
// answered turn and carries every message of the turns refused since, so a retry that the host
// builds wrong fails as a guest error.
export function buildStubSessionScript(outcomes: readonly StubSessionOutcome[]): StubGuestScript {
  const pending = [...outcomes];

  const unanswered = new Set<string>();

  let boundary: SessionPoint | null = null;

  return (turn) => {
    const uuids = turn.input.map((message) => message.uuid);
    const missing = [...unanswered].filter((uuid) => !uuids.includes(uuid));
    const outcome = pending.shift();

    if (
      !isDeepStrictEqual(turn.resume ?? null, boundary) ||
      missing.length > 0 ||
      outcome === undefined
    ) {
      return [
        {
          type: 'failed',
          reason: 'error',
          detail: `the stub session refused a turn that resumed at ${JSON.stringify(turn.resume)}, without ${missing.length} messages, with ${pending.length} outcomes left`,
        },
      ];
    }

    if ('refusal' in outcome) {
      for (const uuid of uuids) {
        unanswered.add(uuid);
      }

      return [
        { type: 'failed', reason: 'model_api', error: outcome.refusal, detail: outcome.detail },
      ];
    }

    boundary = {
      harness: 'agent-sdk',
      sessionID: crypto.randomUUID(),
      messageID: crypto.randomUUID(),
    };

    unanswered.clear();

    return buildAnswer(uuids, outcome.reply, boundary);
  };
}

function buildAnswer(
  uuids: readonly string[],
  reply: string,
  boundary: SessionPoint,
): readonly GuestFrame[] {
  return [
    { type: 'read', uuids },
    { type: 'assistant', messageID: boundary.messageID, text: reply, toolUses: [] },
    {
      type: 'ended',
      boundary,
      outcome: 'finished',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ];
}
