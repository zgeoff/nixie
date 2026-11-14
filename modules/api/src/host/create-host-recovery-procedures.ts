import { withWriteTransaction } from '@heynixie/log';
import { readLatestRecovery, readTaskDirectory } from '@heynixie/tasks';
import { toRecoveryResponse } from '../pause/to-recovery-response';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

export function createHostRecoveryProcedures(context: APIContext) {
  return {
    read: hostImplementer.recovery.read.handler(async () => {
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
