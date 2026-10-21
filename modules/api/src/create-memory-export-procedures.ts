// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { withWriteTransaction } from '@heynixie/log';
import { memoryExportSchemaVersion } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import type { APIContext, ReadViewMemory } from './types';
import { writeMemoryChange } from './write-memory-change';

export function createMemoryExportProcedures(context: APIContext, readMemory: ReadViewMemory) {
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

      return streamChunkEvents(store.view.readExport({ exportedAt }));
    }),
  };
}

async function* streamChunkEvents(chunks: Readonly<AsyncIterable<string>>) {
  for await (const chunk of chunks) {
    yield { chunk };
  }

  yield { isComplete: true as const };
}
