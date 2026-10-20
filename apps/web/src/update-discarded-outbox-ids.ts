import { z } from 'zod';

const storageKey = 'nixie.outbox.discarded';
const keptCount = 500;

// Keeps the client message IDs of the messages any tab discarded, adds the one given, and returns
// them. Every tab shares the list, so a tab that still holds a discarded message, even one asleep
// for days, drops it rather than store it again. Storage changes only when a discard adds an ID.
export function updateDiscardedOutboxIDs(added?: string): readonly string[] {
  const stored = readDiscardedIDs();

  if (added === undefined || stored.includes(added)) {
    return stored;
  }

  // the oldest discards give way first, and a tab would need this many newer ones to outlive its own
  const discarded = [...stored, added].slice(-keptCount);

  globalThis.localStorage.setItem(storageKey, JSON.stringify(discarded));

  return discarded;
}

function readDiscardedIDs(): string[] {
  const stored = globalThis.localStorage.getItem(storageKey);

  if (stored === null) {
    return [];
  }

  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(stored));

    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
