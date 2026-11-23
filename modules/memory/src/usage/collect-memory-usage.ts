import type { ItemUsage, MemoryUsage, RecallCallEntry, RecalledEntry } from './types';

const emptyUsage: ItemUsage = {
  searched: 0,
  pushed: 0,
  lastSurfacedAtMs: null,
  lastRecalledByIDAtMs: null,
  firedTriggers: [],
  hasUnkeyedPush: false,
};

// A recall call writes its record between its own record and its result, on its own thread. A
// record with a search mode is a search inside a call and a push outside one. A record with none
// is a recall by ID inside an ID call, and a list or a turn note counts for nothing.
export function collectMemoryUsage(
  entries: readonly RecalledEntry[],
  calls: readonly RecallCallEntry[],
): MemoryUsage {
  const items = new Map<string, ItemUsage>();

  for (const entry of entries) {
    const surface = pickSurface(entry, calls);

    if (surface === null) {
      continue;
    }

    for (const itemID of new Set(entry.itemIDs)) {
      items.set(
        itemID,
        addSurface(items.get(itemID) ?? emptyUsage, surface, {
          atMs: entry.recordedAtMs,
          triggers: entry.triggers.get(itemID),
        }),
      );
    }
  }

  const times = entries.map((entry) => entry.recordedAtMs);

  return { items, earliestAtMs: times.length === 0 ? null : Math.min(...times) };
}

type Surface = 'search' | 'push' | 'id';

function pickSurface(entry: RecalledEntry, calls: readonly RecallCallEntry[]): Surface | null {
  if (entry.isTurnNote) {
    return null;
  }

  const within = calls.filter(
    (call) =>
      call.thread === entry.thread &&
      call.sequence < entry.sequence &&
      (call.endSequence === null || entry.sequence < call.endSequence),
  );

  if (entry.hasSearchMode) {
    return within.length > 0 ? 'search' : 'push';
  }

  return within.some((call) => call.kind === 'ids') ? 'id' : null;
}

interface SurfaceMark {
  readonly atMs: number;

  // the trigger keys the record names for the item, undefined when it names none
  readonly triggers: readonly string[] | undefined;
}

function addSurface(usage: ItemUsage, surface: Surface, mark: SurfaceMark): ItemUsage {
  if (surface === 'id') {
    return {
      ...usage,
      lastRecalledByIDAtMs: Math.max(usage.lastRecalledByIDAtMs ?? mark.atMs, mark.atMs),
    };
  }

  const isUnkeyed = surface === 'push' && mark.triggers === undefined;

  return {
    ...usage,
    searched: usage.searched + (surface === 'search' ? 1 : 0),
    pushed: usage.pushed + (surface === 'push' ? 1 : 0),
    lastSurfacedAtMs: Math.max(usage.lastSurfacedAtMs ?? mark.atMs, mark.atMs),
    firedTriggers:
      surface === 'push'
        ? [...new Set([...usage.firedTriggers, ...(mark.triggers ?? [])])]
        : usage.firedTriggers,
    hasUnkeyedPush: usage.hasUnkeyedPush || isUnkeyed,
  };
}
