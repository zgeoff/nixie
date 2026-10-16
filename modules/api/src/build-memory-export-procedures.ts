// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { withWriteTransaction } from '@heynixie/log';
import { memoryExportSchemaVersion } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import type { APIContext, ReadViewMemory } from './types';
import { writeMemoryChange } from './write-memory-change';

// Builds the export of every memory item for a signed-in device, as a checked action whose record
// commits with the export's time, schema version and snapshot hash before the file streams. A retry
// with the same ID streams the file again, as it reads now, and only to the device that asked.
export function buildMemoryExportProcedures(context: APIContext, readMemory: ReadViewMemory) {
  return {
    export: apiImplementer.memory.export.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);
      const exportedAt = context.clock.now();

      const outcome = await writeMemoryChange(context, caller, {
        clientActionID: options.input.clientActionID,
        procedure: 'memory.export',
        input: {},
        result: {
          exportedAt,
          schemaVersion: memoryExportSchemaVersion,
          snapshotHash: context.definitions().snapshotHash,
        },
        apply: (writeInTransaction) => withWriteTransaction(context.log.writer, writeInTransaction),
      });

      if (outcome === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (outcome === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      return toChunkEvents(store.view.readExport({ exportedAt }));
    }),
  };
}

// Each piece of the file's text as one event, in the order the file holds them, then the event
// that marks the file complete, so a client tells a whole file from a stream that ended early.
async function* toChunkEvents(chunks: Readonly<AsyncIterable<string>>) {
  for await (const chunk of chunks) {
    yield { chunk };
  }

  yield { isComplete: true as const };
}
