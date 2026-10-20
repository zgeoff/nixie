// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { hostImplementer } from './host-implementer';
import { requireHostMemory } from './require-host-memory';
import { toContractKind } from './to-contract-kind';
import type { ReadHostMemory } from './types';

// Builds the host procedures over one memory item: show it with its history, and write your own
// change to it, an edit, a retirement, a restore, a pin or a forget.
export function createHostItemProcedures(readMemory: ReadHostMemory) {
  const items = hostImplementer.memory.items;

  return {
    read: items.read.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const history = await memory.readHistory(options.input.itemID);

      if (history === null) {
        throw options.errors.NOT_FOUND({ message: 'no memory item has that ID' });
      }

      return {
        itemID: history.itemID,
        subject: history.subject,
        kind: toContractKind(history.subject),
        state: history.state,
        versions: history.versions.map((version) => ({
          version: version.version,
          change: version.change,
          state: version.state,
          origin: version.origin,
          source: version.source,
          recordedAt: new Date(version.recordedAt),
          status: version.status,
          text: version.status === 'readable' ? version.text : null,
        })),
      };
    }),

    edit: items.edit.handler((options) =>
      requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED).edit(
        { itemID: options.input.itemID, version: options.input.version },
        options.input.text,
      ),
    ),

    retire: items.retire.handler((options) =>
      requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED).retire(options.input),
    ),

    restore: items.restore.handler((options) =>
      requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED).restore(options.input),
    ),

    forget: items.forget.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      await memory.forget(options.input);

      return { itemID: options.input.itemID };
    }),

    pin: items.pin.handler(async (options) => {
      const memory = requireHostMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      await memory.pin(options.input.itemID, options.input.isPinned);

      return options.input;
    }),
  };
}
