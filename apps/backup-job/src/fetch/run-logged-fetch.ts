import type { Logger } from '@heynixie/logger';
import type { BackupFetchRequest } from './run-backup-fetch';
import { runBackupFetch } from './run-backup-fetch';

// Returns the exit code, after one line that says how the fetch ended
export async function runLoggedFetch(request: BackupFetchRequest, logger: Logger): Promise<number> {
  const fetched = await runBackupFetch(request);

  if (fetched.status === 'failed') {
    const fields =
      fetched.refusal === undefined
        ? { step: fetched.step }
        : { step: fetched.step, refusal: fetched.refusal };

    logger('backup.fetch_failed', fields, 'error');

    return 1;
  }

  logger('backup.fetched', {
    dataSnapshotID: fetched.pair.data.snapshotID,
    keySnapshotID: fetched.pair.key.snapshotID,
    dataSet: fetched.pair.data.set,
    keySet: fetched.pair.key.set,
    dataPublish: fetched.pair.data.publish,
    keyPublish: fetched.pair.key.publish,
    relation: fetched.pair.relation,
  });

  return 0;
}
