import type { ToolOutcome } from '@heynixie/tools';
import type { WriteOutcome } from './gate-types';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { ProposalCapError } from './proposal-cap-error';
import { StaleVersionError } from './stale-version-error';

// Runs one memory write for a tool. A stale version, a missing item, a wrong state or a full
// proposal cap is the model's to read and act on; any other failure propagates.
export async function runWriteCall(call: () => Promise<WriteOutcome>): Promise<ToolOutcome> {
  try {
    const outcome = await call();

    return { status: 'ok', result: { ...outcome } };
  } catch (error) {
    if (
      error instanceof StaleVersionError ||
      error instanceof MemoryItemNotFoundError ||
      error instanceof MemoryStateError ||
      error instanceof ProposalCapError
    ) {
      return { status: 'error', message: error.message };
    }
    throw error;
  }
}
