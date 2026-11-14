import { withWriteTransaction } from '@heynixie/log';
import { readLatestRecovery, readTaskDirectory } from '@heynixie/tasks';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { toRecoveryResponse } from './to-recovery-response';

export function createRecoveryProcedures(context: APIContext) {
  return {
    read: apiImplementer.recovery.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const started = await withWriteTransaction(context.log.writer, (tx) =>
        readLatestRecovery(tx),
      );

      if (started === null) {
        return { recovery: null };
      }

      const messaging = await readTaskDirectory(context, {
        directory: context.settings.taskDirectory,
      });

      return { recovery: toRecoveryResponse(started, messaging.directory) };
    }),
  };
}
