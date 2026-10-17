import { z } from 'zod';

const storageKey = 'nixie.outbox.discarded';

// Keeps the client message IDs of the messages any tab discarded in the last day, adds the one
// given, and returns them. Every tab shares the list, so a tab that still holds a discarded message
// drops it rather than store it again. Storage changes only when the list does.
export function updateDiscardedOutboxIDs(now: number, added?: string): readonly string[] {
  const stored = readDiscards();
  const kept = stored.filter((discard) => now - discard.discardedAt <= keptForMs);

  const discards =
    added === undefined || kept.some((discard) => discard.clientMessageId === added)
      ? kept
      : [...kept, { clientMessageId: added, discardedAt: now }];

  if (discards.length === 0 && stored.length > 0) {
    globalThis.localStorage.removeItem(storageKey);
  } else if (
    discards.length !== stored.length ||
    discards.some((discard, index) => discard !== stored[index])
  ) {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(discards));
  }

  return discards.map((discard) => discard.clientMessageId);
}

// a discard counts until every tab open when it happened has had time to drop the message
const keptForMs = 24 * 60 * 60 * 1000;
const discardsSchema = z.array(z.object({ clientMessageId: z.string(), discardedAt: z.number() }));

function readDiscards(): z.infer<typeof discardsSchema> {
  const stored = globalThis.localStorage.getItem(storageKey);

  if (stored === null) {
    return [];
  }

  try {
    const parsed = discardsSchema.safeParse(JSON.parse(stored));

    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
