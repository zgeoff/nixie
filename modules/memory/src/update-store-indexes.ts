import { readIndexEntries } from './read-index-entries';
import { readMessageEntries } from './read-message-entries';
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

  return { rebuilt: runVectorRebuilds(parts, { items: entries, messages: messages.entries }) };
}

interface RebuildEntries {
  readonly items: readonly IndexEntry[];
  readonly messages: readonly IndexEntry[];
}

async function runVectorRebuilds(parts: StoreParts, entries: RebuildEntries): Promise<boolean> {
  if (parts.vectors === null || parts.messages.vectors === null) {
    return false;
  }

  const rebuilt = await Promise.all([
    parts.vectors.rebuild(entries.items),
    parts.messages.vectors.rebuild(entries.messages),
  ]);

  return rebuilt.every(Boolean);
}
