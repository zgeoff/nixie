import { startBackupSchedule } from '@heynixie/backup';
import { localDataStorage } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { ServerParts } from './types';

export async function startServerBackups(parts: ServerParts): Promise<void> {
  if (!parts.config.backup.isEnabled) {
    parts.log('backup.off');

    return;
  }

  const schedule = startBackupSchedule({
    context: { writer: parts.context.log.writer, storage: localDataStorage },
    intervalMs: parts.config.backup.intervalMs,
    onAbandoned: (sequences) => {
      parts.log('backup.sets_abandoned', { sequences: sequences.join(',') });
    },
    onPass: (pass) => {
      for (const receipt of pass.received) {
        if ('refused' in receipt) {
          parts.log('backup.receipt_refused', {
            sequence: receipt.sequence,
            reason: receipt.refused,
          });
        } else if (receipt.status === 'failed') {
          parts.log('backup.set_failed', {
            sequence: receipt.sequence,
            failure: receipt.failure ?? '',
          });
        } else {
          parts.log('backup.set_published', { sequence: receipt.sequence });
        }
      }

      if (pass.staged !== null) {
        parts.log('backup.set_staged', {
          sequence: pass.staged.sequence,
          kind: pass.staged.kind,
        });
      }
    },
    onError: (error) => {
      parts.log('backup.pass_failed', toErrorFields(error));
    },
  });

  await parts.cleanup.defer(() => schedule.stop());
}
