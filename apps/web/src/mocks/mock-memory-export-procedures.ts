// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { readMockMemoryExport } from './read-mock-memory-export';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

const exportInput = JSON.stringify(['export']);

type ExportEvent = { readonly chunk: string } | { readonly isComplete: true };

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
