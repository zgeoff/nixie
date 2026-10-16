// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { readMockMemoryExport } from './read-mock-memory-export';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

// the input an export binds its client action ID to, which no memory change uses
const exportInput = JSON.stringify(['export']);

type ExportEvent = { readonly chunk: string } | { readonly isComplete: true };

// The export over the mock store, as nixie's API serves it: a checked action that keeps its client
// action ID, then streams the file a chunk at a time and marks it complete. A retry with the same
// ID streams it again.
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

    const chunks = readMockMemoryExport(new Date());

    // a stream of the chunks, then the completion event, which the procedure sends as events as
    // nixie's API does
    const stream = new ReadableStream<ExportEvent>({
      start: (controller: Readonly<ReadableStreamDefaultController<ExportEvent>>) => {
        for (const chunk of chunks) {
          controller.enqueue({ chunk });
        }

        controller.enqueue({ isComplete: true });
        controller.close();
      },
    });

    return stream.values();
  }),
};
