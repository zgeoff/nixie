import type { ToolOutcome } from '@heynixie/tools';
import type { ModelWriteStore, WriteOutcome } from '../gate/gate-context';
import type { ItemIDStore } from '../types';
import { buildHiddenUUIDs } from '../utils/build-hidden-uuids';
import { isWriteRefusal } from '../utils/error/is-write-refusal';

export async function runWriteCall(
  memory: Pick<ItemIDStore, 'readShortIDs'> & Pick<ModelWriteStore, 'renderReviewReason'>,
  call: () => Promise<WriteOutcome>,
  itemID: string | null = null,
): Promise<ToolOutcome> {
  try {
    const outcome = await call();

    if (outcome.status === 'proposed') {
      const { shortID, ...shown } = outcome;

      return {
        status: 'ok',
        result: {
          ...shown,
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
    if (isWriteRefusal(error)) {
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
