import { apiImplementer } from './api-implementer';
import { createMemoryForgetProcedures } from './create-memory-forget-procedures';
import { ownerProvenance } from './owner-provenance';
import { runMemoryChange } from './run-memory-change';
import type { APIContext, ReadViewMemory } from './types';

// Builds the memory view's changes for a signed-in device: retire, restore, pin, unpin and forget,
// each a checked action bound to the version the view showed, with you as its origin and its source.
export function createMemoryChangeProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;
  const parts = { context, readMemory };

  return {
    retire: memory.retire.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID, version: target.version + 1 };

      await runMemoryChange(parts, options, (store) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.retire',
        input: target,
        result,
        apply: (writeInTransaction) =>
          store.retire({ target, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),

    restore: memory.restore.handler(async (options) => {
      const target = { itemID: options.input.itemID, version: options.input.version };
      const result = { itemID: target.itemID, version: target.version + 1 };

      await runMemoryChange(parts, options, (store) => ({
        clientActionID: options.input.clientActionID,
        procedure: 'memory.restore',
        input: target,
        result,
        apply: (writeInTransaction) =>
          store.restore({ target, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),

    pin: memory.pin.handler(async (options) => {
      const { clientActionID, ...input } = options.input;
      const result = { itemID: input.itemID, isPinned: input.isPinned };

      await runMemoryChange(parts, options, (store) => ({
        clientActionID,
        procedure: 'memory.pin',
        input,
        result,
        apply: (writeInTransaction) =>
          store.pin({ ...input, provenance: ownerProvenance, writeInTransaction }),
      }));

      return result;
    }),

    ...createMemoryForgetProcedures(context, readMemory),
  };
}
