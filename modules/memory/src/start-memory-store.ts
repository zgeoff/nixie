import { buildItemIDStore } from './build-item-id-store';
import type { MemoryGate } from './build-memory-gate';
import { buildMemoryGate } from './build-memory-gate';
import { buildMemoryStore } from './build-memory-store';
import type { MomentStore } from './build-moment-store';
import { buildMomentStore } from './build-moment-store';
import { makeDeliveryLock } from './make-delivery-lock';
import { removeLeftKeys } from './remove-left-keys';
import { runPendingForgets } from './run-pending-forgets';
import { startStoreIndexes } from './start-store-indexes';
import type { ItemIDStore, MemoryContext, MemoryStore, StoreParts } from './types';
import type { UpdatedIndexes } from './update-store-indexes';
import { updateStoreIndexes } from './update-store-indexes';
import type { BatchPublication, PublishResult } from './write-memory-batch';
import { writeMemoryBatch } from './write-memory-batch';

export interface StartedMemoryStore extends MemoryStore, MemoryGate, ItemIDStore {
  readonly writeBatch: (publication: BatchPublication) => Promise<PublishResult>;

  readonly moments: MomentStore;

  readonly waitForSemanticIndex: () => Promise<boolean>;
  readonly stop: () => Promise<void>;
}

export async function startMemoryStore(context: MemoryContext): Promise<StartedMemoryStore> {
  const indexes = await startStoreIndexes(context);

  const parts: StoreParts = { context, ...indexes, lock: makeDeliveryLock() };

  const updated = await runStartSteps(parts);

  return {
    ...buildMemoryStore(parts),
    ...buildItemIDStore(parts),
    ...buildMemoryGate(parts),
    writeBatch: (publication) => writeMemoryBatch(parts, publication),
    moments: buildMomentStore(context),
    waitForSemanticIndex: async () => {
      const isReady = await updated.rebuilt;

      await Promise.all([parts.vectors?.waitForIdle(), parts.messages.vectors?.waitForIdle()]);

      return isReady;
    },
    stop: () => parts.lock(() => stopIndexes(parts)),
  };
}

async function runStartSteps(parts: StoreParts): Promise<UpdatedIndexes> {
  try {
    await runPendingForgets(parts);
    await removeLeftKeys(parts);

    return await updateStoreIndexes(parts);
  } catch (error) {
    await stopIndexes(parts);

    throw error;
  }
}

async function stopIndexes(parts: StoreParts): Promise<void> {
  await Promise.all([
    parts.index.stop(),
    parts.vectors?.stop(),
    parts.messages.index.stop(),
    parts.messages.vectors?.stop(),
  ]);
}
