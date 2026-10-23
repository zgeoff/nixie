import type { ToolOutcome } from '@heynixie/tools';
import type { ModelWriteStore, WriteOutcome } from './gate-types';
import { ImageSourceError } from './image-source-error';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { NotPinnedError } from './not-pinned-error';
import { PinnedCoreFullError } from './pinned-core-full-error';
import { ProposalCapError } from './proposal-cap-error';
import { SelfNoteError } from './self-note-error';
import { StaleVersionError } from './stale-version-error';
import type { ItemIDStore } from './types';
import { UntilPassedError } from './until-passed-error';

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
      error instanceof NotPinnedError ||
      error instanceof PinnedCoreFullError ||
      error instanceof ProposalCapError ||
      error instanceof SelfNoteError ||
      error instanceof ImageSourceError ||
      error instanceof UntilPassedError
    ) {
      return { status: 'error', message: await readShortIDMessage(memory, error.message, itemID) };
    }

    throw error;
  }
}

async function readShortIDMessage(
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
