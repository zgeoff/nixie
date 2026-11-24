import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { TurnState } from './turn-state';

export function startCutIfDue(session: Query, state: TurnState): void {
  if (isCutDue(state)) {
    state.isStreaming = false;
    state.cut = { receipt: readCutReceipt(session, state) };
  }
}

function isCutDue(state: TurnState): boolean {
  return (
    state.canCut &&
    state.cut === null &&
    !state.isInterrupted &&
    state.isStreaming &&
    !state.hasToolUse &&
    [...state.cutting].some((uuid) => state.pending.has(uuid) && state.queued.has(uuid))
  );
}

const interruptReceiptSchema = z.looseObject({ still_queued: z.array(z.string()) });

async function readCutReceipt(session: Query, state: TurnState): Promise<readonly string[] | null> {
  const interrupted = await session
    .interrupt()
    .then((response) => ({ response }))
    .catch(() => null);

  const receipt =
    interrupted === null ? null : interruptReceiptSchema.safeParse(interrupted.response);

  const stillQueued = receipt?.success === true ? receipt.data.still_queued : [];

  for (const uuid of state.pending) {
    if (!stillQueued.includes(uuid)) {
      state.unlisted.add(uuid);
    }
  }

  return receipt?.success === true ? stillQueued : null;
}
