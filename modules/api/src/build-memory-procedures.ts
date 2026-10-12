import { readWriterStatus } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';

// Builds the memory procedures of a signed-in device: the memory writer's status.
export function buildMemoryProcedures(context: APIContext) {
  return {
    writerStatus: apiImplementer.memory.writerStatus.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const status = await readWriterStatus(context.log);

      return {
        backlog: status.backlog,
        batches: status.batches,
        cursor: status.cursor,
        failures: status.failures,
        isCatchingUp: status.isCatchingUp,
        lastError:
          status.lastError === null
            ? null
            : {
                at: new Date(status.lastError.at),
                code: status.lastError.code,
                message: status.lastError.message,
              },
        retryAt: status.retryAt === null ? null : new Date(status.retryAt),
      };
    }),
  };
}
