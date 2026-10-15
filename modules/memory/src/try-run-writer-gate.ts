import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import type { GateLookups } from './run-writer-gate';
import { runWriterGate } from './run-writer-gate';
import { StaleVersionError } from './stale-version-error';
import type { GatedWrite } from './write-memory-batch';
import type { StagedWrite, WriterGate } from './writer-types';

// Gates a batch's staged writes, or returns null when an item a write targets moved on, was
// retired or was forgotten since the session read it, so the batch runs again at once.
export async function tryRunWriterGate(
  gate: WriterGate,
  writes: readonly StagedWrite[],
  lookups: GateLookups,
): Promise<readonly GatedWrite[] | null> {
  try {
    return await runWriterGate(gate, writes, lookups);
  } catch (error) {
    if (
      error instanceof StaleVersionError ||
      error instanceof MemoryStateError ||
      error instanceof MemoryItemNotFoundError
    ) {
      return null;
    }

    throw error;
  }
}
