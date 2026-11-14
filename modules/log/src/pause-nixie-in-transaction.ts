import { closeToOlderReaders, pauseMigrationVersion } from '@heynixie/db';
import type { Transaction } from 'kysely';
import { nixiePausedCodec } from './nixie-paused-codec';
import { readPause } from './read-pause';
import type { Definitions, PauseCause, PauseLog } from './types';
import { writeRecordsInTransaction } from './write-records-in-transaction';

export interface PauseNixieRequest {
  readonly cause: PauseCause;
  readonly recoveryID: string | null;
  readonly by: string | null;
  readonly definitions: Definitions;
}

export async function pauseNixieInTransaction(
  tx: Transaction<unknown>,
  log: PauseLog,
  request: PauseNixieRequest,
): Promise<void> {
  requireRecoveryIDForRestore(request);

  const pause = await readPause(tx);

  if (pause !== null && request.cause === 'spending') {
    return;
  }

  await writeRecordsInTransaction(tx, log, [
    {
      kind: 'nixie.paused',
      definitions: request.definitions,
      payload: nixiePausedCodec.encode({
        cause: request.cause,
        recoveryID: request.recoveryID,
        by: request.by,
      }),
    },
  ]);

  await closeToOlderReaders(tx, pauseMigrationVersion);
}

function requireRecoveryIDForRestore(request: PauseNixieRequest): void {
  if (request.cause === 'restore' && request.recoveryID === null) {
    throw new Error('a restore pause needs a recovery ID');
  }

  if (request.cause !== 'restore' && request.recoveryID !== null) {
    throw new Error('only a restore pause takes a recovery ID');
  }
}
