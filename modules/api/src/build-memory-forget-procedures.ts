import { apiImplementer } from './api-implementer';
import { ownerProvenance } from './owner-provenance';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { runMemoryChange } from './run-memory-change';
import { toContractMemoryItem } from './to-contract-memory-item';
import { toContractMemoryVersion } from './to-contract-memory-version';
import { toMemoryChangeError } from './to-memory-change-error';
import type { APIContext, ReadViewMemory } from './types';

// Builds the memory view's forget for a signed-in device: the preview of what a forget of an item
// at the version the view showed destroys, then the forget itself, a checked action bound to that
// version with you as its origin.
export function buildMemoryForgetProcedures(context: APIContext, readMemory: ReadViewMemory) {
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

    // A retry finds the forget's result and runs its cleanup again, so a forget whose cleanup failed
    // after its start committed completes; after a completed forget that cleanup runs nothing.
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
  };
}
