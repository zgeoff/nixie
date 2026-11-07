import { readBackupHealth } from '@heynixie/backup';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';

export function createBackupProcedures(context: APIContext) {
  return {
    readNotice: apiImplementer.backups.readNotice.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      if (!context.settings.isBackupEnabled) {
        return { notice: null };
      }

      const health = await readBackupHealth(context.log.writer);

      return {
        notice:
          health.notice === null
            ? null
            : {
                cause: health.notice.cause,
                sequence: health.notice.sequence,
                raisedAt: new Date(health.notice.raisedAt),
              },
      };
    }),
  };
}
