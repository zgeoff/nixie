import { readBackupHealth } from '@heynixie/backup';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';

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
