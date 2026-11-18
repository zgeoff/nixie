import { oc } from '@orpc/contract';
import { z } from 'zod';

export const hostBackupsContract = {
  stage: oc
    .errors({
      BACKUP_SET_WAITING: {
        message: 'a backup set waits for the backup job, so nixie stages no other set',
        status: 409,
      },
      BACKUPS_OFF: {
        message: "backups are off in nixie's configuration, so nixie stages no set",
        status: 409,
      },
      BACKUPS_NOT_STARTED: {
        message: 'nixie has not started its backups yet; try again in a moment',
        status: 503,
      },
      RESTORE_PAUSED: {
        message:
          'nixie is paused after a restore and stages no backup set until you read `nixie recovery` and run `nixie resume`',
        status: 409,
      },
    })
    .output(
      z.object({
        sequence: z.int().positive(),
        kind: z.enum(['scheduled', 'forget']),
        stagedAt: z.date(),
      }),
    ),
};
