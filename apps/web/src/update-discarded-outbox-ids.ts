import { z } from 'zod';

const storageKey = 'nixie.outbox.discarded';
const keptCount = 500;

export function updateDiscardedOutboxIDs(added?: string): readonly string[] {
  const stored = readDiscardedIDs();

  if (added === undefined || stored.includes(added)) {
    return stored;
  }

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
