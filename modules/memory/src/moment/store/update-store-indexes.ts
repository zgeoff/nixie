import { readIndexEntries } from '../../memory/read-index-entries';
import type { IndexEntry } from '../../memory/start-memory-index';
import { readMessageEntries } from '../../message/read-message-entries';
import type { StoreParts } from '../../types';
import { readMomentEntries } from '../read-moment-entries';

export interface UpdatedIndexes {
  readonly rebuilt: Promise<boolean>;
}

export async function updateStoreIndexes(parts: StoreParts): Promise<UpdatedIndexes> {
  const entries = await readIndexEntries(parts.context);
  const messages = await readMessageEntries(parts.context, 0);

  const triggers = collectTriggerPhrases(parts, entries);

  await parts.index.updateAll(entries);
  await parts.triggers.updateAll(triggers);
  await parts.messages.index.updateAll(messages.entries);

  parts.messages.cursor.updateThrough(messages.through);

  const moments = await readMomentRebuildEntries(parts);

  return {
    rebuilt: runVectorRebuilds(parts, {
      items: entries,
      triggers,
      messages: messages.entries,
      moments,
    }),
  };
}

// The same active set as the item index, each item with its newest trigger phrases.
function collectTriggerPhrases(
  parts: StoreParts,
  entries: readonly IndexEntry[],
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    entries.flatMap((entry) => {
      const triggers = parts.labels.find(entry.itemID)?.triggers ?? [];

      return triggers.length === 0 ? [] : [[entry.itemID, triggers] as const];
    }),
  );
}

async function readMomentRebuildEntries(parts: StoreParts): Promise<readonly IndexEntry[]> {
  if (parts.moments.vectors === null) {
    return [];
  }

  const moments = await readMomentEntries(parts.context.log, 0);

  parts.moments.cursor.through = moments.through;

  return moments.entries;
}

interface RebuildEntries {
  readonly items: readonly IndexEntry[];
  readonly triggers: ReadonlyMap<string, readonly string[]>;
  readonly messages: readonly IndexEntry[];
  readonly moments: readonly IndexEntry[];
}

async function runVectorRebuilds(parts: StoreParts, entries: RebuildEntries): Promise<boolean> {
  if (parts.vectors === null || parts.messages.vectors === null || parts.moments.vectors === null) {
    return false;
  }

  const rebuilt = await Promise.all([
    parts.vectors.rebuild(entries.items),
    parts.triggers.rebuildVectors(entries.triggers),
    parts.messages.vectors.rebuild(entries.messages),
    parts.moments.vectors.rebuild(entries.moments),
  ]);

  return rebuilt.every(Boolean);
}
