import { reopenToOlderReaders } from '@heynixie/db';
import type { Transaction } from 'kysely';
import { nixieResumedCodec } from '../record/nixie-resumed-codec';
import { writeRecordsInTransaction } from '../record/write-records-in-transaction';
import type { Definitions, PauseLog } from '../types';
import { readPause } from './read-pause';

export interface ResumeNixieRequest {
  readonly by: string;
  readonly definitions: Definitions;
}

export async function resumeNixieInTransaction(
  tx: Transaction<unknown>,
  log: PauseLog,
  request: ResumeNixieRequest,
): Promise<{ readonly wasPaused: boolean }> {
  const pause = await readPause(tx);

  if (pause === null) {
    return { wasPaused: false };
  }

  await writeRecordsInTransaction(tx, log, [
    {
      kind: 'nixie.resumed',
      definitions: request.definitions,
      payload: nixieResumedCodec.encode({ by: request.by }),
    },
  ]);

  await reopenToOlderReaders(tx);

  return { wasPaused: true };
}
