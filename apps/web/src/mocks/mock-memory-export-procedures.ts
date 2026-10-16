// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { readMockMemoryExport } from './read-mock-memory-export';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

// The export over the mock store, as nixie's API serves it: a checked action that keeps its client
// action ID, then streams the file a chunk at a time. A retry with the same ID streams it again.
export const mockMemoryExportProcedures = {
  export: mockImplementer.memory.export.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const clientActionID = options.input.clientActionID;
    const earlier = store.memoryActions.findFirst((query) => query.where({ clientActionID }));

    if (earlier !== undefined && earlier.input !== exportInput) {
      throw options.errors.CLIENT_ACTION_ID_REUSED();
    }

    if (earlier === undefined) {
      await store.memoryActions.create({ clientActionID, input: exportInput });
    }

    return toChunkEvents(readMockMemoryExport(new Date()));
  }),
};

// the input an export binds its client action ID to, which no memory change uses
const exportInput = JSON.stringify(['export']);

async function* toChunkEvents(chunks: AsyncIterable<string>) {
  for await (const chunk of chunks) {
    yield { chunk };
  }
}
