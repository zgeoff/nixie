import { buildShortIDFromUUID } from '@heynixie/db';
import type { ToolOutcome } from '@heynixie/tools';
import type { ModelWriteStore, WriteOutcome } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { buildHiddenUUIDs } from '../utils/build-hidden-uuids';
import { ImageSourceError } from '../utils/error/image-source-error';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { MemoryStateError } from '../utils/error/memory-state-error';
import { NotPinnedError } from '../utils/error/not-pinned-error';
import { PinnedCoreFullError } from '../utils/error/pinned-core-full-error';
import { ProposalCapError } from '../utils/error/proposal-cap-error';
import { SelfNoteError } from '../utils/error/self-note-error';
import { StaleVersionError } from '../utils/error/stale-version-error';
import { UntilPassedError } from '../utils/error/until-passed-error';

export async function runWriteCall(
  memory: Pick<ItemIDStore, 'readShortIDs'> & Pick<ModelWriteStore, 'renderReviewReason'>,
  call: () => Promise<WriteOutcome>,
  itemID: string | null = null,
): Promise<ToolOutcome> {
  try {
    const outcome = await call();

    if (outcome.status === 'proposed') {
      const shortID = buildShortIDFromUUID(outcome.proposalID);

      return {
        status: 'ok',
        result: {
          ...outcome,
          proposalID: shortID,
          reason: memory.renderReviewReason(outcome.reason),
        },
        ...buildHiddenUUIDs([[shortID, outcome.proposalID]]),
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
