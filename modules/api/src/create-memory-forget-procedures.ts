import { apiImplementer } from './api-implementer';
import { ownerProvenance } from './owner-provenance';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { runMemoryChange } from './run-memory-change';
import { toContractMemoryItem } from './to-contract-memory-item';
import { toContractMemoryVersion } from './to-contract-memory-version';
import { toMemoryChangeError } from './to-memory-change-error';
import type { APIContext, ReadViewMemory } from './types';

export function createMemoryForgetProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;

  return {
    previewForget: memory.previewForget.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const preview = await store.view.readForgetPreview(options.input).catch((error: unknown) => {
        throw toMemoryChangeError(error, options.errors);
      });

      return {
        ...toContractMemoryItem(preview),
        versions: preview.versions.map((version) => toContractMemoryVersion(version)),
        lost: preview.lost,
      };
    }),

    forget: memory.forget.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID };

      const store = await runMemoryChange({ context, readMemory }, options, (memoryStore) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.forget',
        input: target,
        result,
        apply: (writeInTransaction) =>
          memoryStore.forget({ target, provenance: ownerProvenance, writeInTransaction }),
      }));

      await store.finishForget(target.itemID);

      return result;
    }),

    previewForgetRetired: memory.previewForgetRetired.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const preview = await store.view.readRetiredForgetPreview();

      return {
        items: preview.items.map((item) => ({ ...toContractMemoryItem(item), lost: item.lost })),
        hasMore: preview.hasMore,
      };
    }),

    forgetRetired: memory.forgetRetired.handler(async (options) => {
      const targets = options.input.targets.map((target) => ({
        itemID: target.itemID,
        version: target.version,
      }));

      const itemIDs = targets.map((target) => target.itemID);

      const store = await runMemoryChange({ context, readMemory }, options, (memoryStore) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.forgetRetired',
        input: { targets },
        result: { itemIDs },
        apply: (writeInTransaction) =>
          memoryStore.forgetRetired({ targets, provenance: ownerProvenance, writeInTransaction }),
      }));

      const status = await store.finishForgets(itemIDs);

      return { deleted: [...status.deleted], pending: [...status.pending] };
    }),

    readForgetStatus: memory.readForgetStatus.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const status = await store.view.readForgetStatus(options.input.itemIDs);

      return { deleted: [...status.deleted], pending: [...status.pending] };
    }),
  };
}
