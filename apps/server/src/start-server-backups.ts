import type { BackupContext } from '@heynixie/backup';
import { startBackupSchedule } from '@heynixie/backup';
import { localDataStorage } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { Cleanup, ServerParts } from './types';

export interface ServerBackupParts extends Pick<ServerParts, 'log' | 'state'> {
  readonly config: Pick<ServerParts['config'], 'backup'>;
  readonly cleanup: Pick<Cleanup, 'defer'>;
  readonly context: { readonly log: { readonly writer: BackupContext['writer'] } };
}

export async function startServerBackups(parts: ServerBackupParts): Promise<void> {
  if (!parts.config.backup.isEnabled) {
    parts.state.update({ backups: { state: 'off' } });
    parts.log('backup.off');

    return;
  }

  const intervalMs = parts.config.backup.intervalMs;
  const startedAt = parts.context.log.writer.clock.now();

  parts.state.update({ backups: { state: 'on', intervalMs, startedAt, health: null } });

  const schedule = startBackupSchedule({
    context: { writer: parts.context.log.writer, storage: localDataStorage },
    intervalMs,
    onAbandoned: (sequences) => {
      parts.log('backup.sets_abandoned', { sequences: sequences.join(',') });
    },
    onPass: (pass) => {
      parts.state.update({
        backups: { state: 'on', intervalMs, startedAt, health: pass.health },
      });

      for (const notice of pass.noticed) {
        parts.log(
          'backup.notice_raised',
          { sequence: notice.sequence, cause: notice.cause },
          'warn',
        );
      }

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
