import type { StartedMemoryStore } from '@heynixie/memory';
import type { NotebookMemory } from '../types';

type MemoryReads = Pick<StartedMemoryStore, 'readItemIDMap' | 'readShortIDs'> & {
  readonly writes: Pick<StartedMemoryStore['writes'], 'readItemLabels'>;
};

// What the notebook reads of memory, from the started store: an item's ID in either form, its
// short ID, and its gist. The store is read when a call runs, because memory starts first and the
// notebook's tools exist before either.
export function buildNotebookMemory(readStore: () => MemoryReads | null): NotebookMemory {
  const requireStore = (): MemoryReads => {
    const store = readStore();

    if (store === null) {
      throw new Error('a notebook call ran before the memory store started');
    }

    return store;
  };

  return {
    readItemIDMap: (ids) => requireStore().readItemIDMap(ids),
    readShortIDs: (itemIDs) => requireStore().readShortIDs(itemIDs),
    readGist: async (itemID) => {
      const labels = await requireStore()
        .writes.readItemLabels(itemID)
        .catch(() => null);

      return labels?.gist ?? null;
    },
  };
}
