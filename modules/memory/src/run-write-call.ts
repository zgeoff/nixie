import type { ToolOutcome } from '@heynixie/tools';
import type { ModelWriteStore, WriteOutcome } from './gate-types';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { ProposalCapError } from './proposal-cap-error';
import { SelfNoteError } from './self-note-error';
import { StaleVersionError } from './stale-version-error';
import type { ItemIDStore } from './types';

// Runs one memory write for a tool, on itemID when it targets an item. A store refusal, such as a
// stale version or a self-note refusal, is the model's to read; any other failure propagates. The
// result and the error name the item by the short ID, and a proposal's reason adds its sentence.
export async function runWriteCall(
  memory: Pick<ItemIDStore, 'readShortIDs'> & Pick<ModelWriteStore, 'renderReviewReason'>,
  call: () => Promise<WriteOutcome>,
  itemID: string | null = null,
): Promise<ToolOutcome> {
  try {
    const outcome = await call();

    if (outcome.status === 'proposed') {
      return {
        status: 'ok',
        result: { ...outcome, reason: memory.renderReviewReason(outcome.reason) },
      };
    }

    const shortIDs = await memory.readShortIDs([outcome.itemID]);

    return {
      status: 'ok',
      result: { ...outcome, itemID: shortIDs.get(outcome.itemID) ?? outcome.itemID },
    };
  } catch (error) {
    if (
      error instanceof StaleVersionError ||
      error instanceof MemoryItemNotFoundError ||
      error instanceof MemoryStateError ||
      error instanceof ProposalCapError ||
      error instanceof SelfNoteError
    ) {
      return { status: 'error', message: await renderMessage(memory, error.message, itemID) };
    }

    throw error;
  }
}

// the error's message with the item ID it names swapped for the item's short ID
async function renderMessage(
  memory: Pick<ItemIDStore, 'readShortIDs'>,
  message: string,
  itemID: string | null,
): Promise<string> {
  if (itemID === null) {
    return message;
  }

  const shortIDs = await memory.readShortIDs([itemID]);

  const shortID = shortIDs.get(itemID);

  return shortID === undefined ? message : message.replaceAll(itemID, shortID);
}
