import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import type { GateLookups } from './run-writer-gate';
import { runWriterGate } from './run-writer-gate';
import { StaleVersionError } from './stale-version-error';
import type { GatedWrite } from './write-memory-batch';
import type { StagedWrite, WriterGate } from './writer-types';

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
