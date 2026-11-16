import { buildItemIDStore } from '../item/build-item-id-store';
import { readLabelEntries } from '../label/read-label-entries';
import { runLabelBackfill } from '../label/run-label-backfill';
import type { MomentStore } from '../moment/store/build-moment-store';
import { buildMomentStore } from '../moment/store/build-moment-store';
import { startStoreIndexes } from '../moment/store/start-store-indexes';
import type { UpdatedIndexes } from '../moment/store/update-store-indexes';
import { updateStoreIndexes } from '../moment/store/update-store-indexes';
import { runPendingDestroys } from '../pending/run-pending-destroys';
import { runPendingForgets } from '../pending/run-pending-forgets';
import type { ItemIDStore, MemoryContext, MemoryStore, StoreParts } from '../types';
import { makeDeliveryLock } from '../utils/make-delivery-lock';
import type { MemoryGate } from './build-memory-gate';
import { buildMemoryGate } from './build-memory-gate';
import { buildMemoryStore } from './build-memory-store';
import { removeLeftKeys } from './remove-left-keys';

export interface StartedMemoryStore extends MemoryStore, MemoryGate, ItemIDStore {
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
    moments: buildMomentStore(context, parts.moments),
    waitForSemanticIndex: async () => {
      const isReady = await updated.rebuilt;

      await Promise.all([
        parts.vectors?.waitForIdle(),
        parts.messages.vectors?.waitForIdle(),
        parts.moments.vectors?.waitForIdle(),
      ]);

      return isReady;
    },
    stop: () => parts.lock(() => stopIndexes(parts)),
  };
}

async function runStartSteps(parts: StoreParts): Promise<UpdatedIndexes> {
  try {
    await runPendingForgets(parts);
    await runPendingDestroys(parts.context);
    await removeLeftKeys(parts);

    const entries = await readLabelEntries(parts);

    parts.labels.replaceAll(entries);

    await runLabelBackfill(parts);

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
    parts.moments.vectors?.stop(),
  ]);
}
