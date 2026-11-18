// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import type { ReadHostBackups } from '../types';
import { hostImplementer } from './host-implementer';

export function createHostBackupProcedures(readBackups: ReadHostBackups) {
  return {
    stage: hostImplementer.backups.stage.handler(async (options) => {
      const backups = readBackups();

      if (backups === null) {
        throw options.errors.BACKUPS_NOT_STARTED();
      }

      if (backups.state === 'off') {
        throw options.errors.BACKUPS_OFF();
      }

      const outcome = await backups.schedule.stage();

      return match(outcome)
        .with({ status: 'staged' }, (staged) => ({
          sequence: staged.manifest.sequence,
          kind: staged.manifest.kind,
          stagedAt: new Date(staged.manifest.stagedAt),
        }))
        .with({ status: 'set_waiting' }, (waiting) => {
          throw options.errors.BACKUP_SET_WAITING({
            message: `backup set ${waiting.sequence} is staged and the backup job has not shipped it yet, so nixie stages no other set; run the backup job, then try again`,
          });
        })
        .with({ status: 'restore_pause' }, () => {
          throw options.errors.RESTORE_PAUSED();
        })
        .exhaustive();
    }),
  };
}
