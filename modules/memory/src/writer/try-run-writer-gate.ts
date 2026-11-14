import type { GatedWrite } from '../memory/write-memory-batch';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { MemoryStateError } from '../utils/error/memory-state-error';
import { StaleVersionError } from '../utils/error/stale-version-error';
import type { GateLookups } from './run-writer-gate';
import { runWriterGate } from './run-writer-gate';
import type { StagedWrite, WriterGate } from './writer-model';

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
