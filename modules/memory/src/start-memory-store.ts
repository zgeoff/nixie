import { buildMemoryStore } from './build-memory-store';
import { makeDeliveryLock } from './make-delivery-lock';
import { readIndexEntries } from './read-index-entries';
import { runPendingForgets } from './run-pending-forgets';
import { startMemoryIndex } from './start-memory-index';
import type { MemoryContext, MemoryStore, StoreParts } from './types';

export interface StartedMemoryStore extends MemoryStore {
  readonly stop: () => Promise<void>;
}

// Puts memory into service: it resumes every pending forget, then builds the index from the
// readable active items. The log must already hold the memory projections.
export async function startMemoryStore(context: MemoryContext): Promise<StartedMemoryStore> {
  const index = await startMemoryIndex();
  const parts: StoreParts = { context, index, lock: makeDeliveryLock() };

  try {
    await runPendingForgets(parts);

    const entries = await readIndexEntries(context);

    await index.updateAll(entries);
  } catch (error) {
    await index.stop();
    throw error;
  }
  return { ...buildMemoryStore(parts), stop: () => parts.lock(() => index.stop()) };
}
