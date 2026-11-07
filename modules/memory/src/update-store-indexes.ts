import { readIndexEntries } from './read-index-entries';
import { readMessageEntries } from './read-message-entries';
import { readMomentEntries } from './read-moment-entries';
import type { IndexEntry } from './start-memory-index';
import type { StoreParts } from './types';

export interface UpdatedIndexes {
  readonly rebuilt: Promise<boolean>;
}

export async function updateStoreIndexes(parts: StoreParts): Promise<UpdatedIndexes> {
  const entries = await readIndexEntries(parts.context);
  const messages = await readMessageEntries(parts.context, 0);

  await parts.index.updateAll(entries);
  await parts.messages.index.updateAll(messages.entries);

  parts.messages.cursor.updateThrough(messages.through);

  const moments = await readMomentEntries(parts.context.log, 0);

  parts.moments.cursor.through = moments.through;

  return {
    rebuilt: runVectorRebuilds(parts, {
      items: entries,
      messages: messages.entries,
      moments: moments.entries,
    }),
  };
}

interface RebuildEntries {
  readonly items: readonly IndexEntry[];
  readonly messages: readonly IndexEntry[];
  readonly moments: readonly IndexEntry[];
}

async function runVectorRebuilds(parts: StoreParts, entries: RebuildEntries): Promise<boolean> {
  if (parts.vectors === null || parts.messages.vectors === null || parts.moments.vectors === null) {
    return false;
  }

  const rebuilt = await Promise.all([
    parts.vectors.rebuild(entries.items),
    parts.messages.vectors.rebuild(entries.messages),
    parts.moments.vectors.rebuild(entries.moments),
  ]);

  return rebuilt.every(Boolean);
}
