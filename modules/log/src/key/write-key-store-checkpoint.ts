import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Log } from '../types';
import { KeyStoreBusyError } from './key-store-busy-error';

const checkpointSchema = z.object({ busy: z.number(), log: z.number(), checkpointed: z.number() });

export async function writeKeyStoreCheckpoint(
  log: Pick<Log, 'writer'>,
  keyID: string | null,
): Promise<void> {
  const [checkpoint] = await readQueryRows(
    sql`pragma wal_checkpoint(truncate)`,
    log.writer.keys,
    checkpointSchema,
  );

  if (
    checkpoint === undefined ||
    checkpoint.busy !== 0 ||
    checkpoint.log !== checkpoint.checkpointed
  ) {
    throw new KeyStoreBusyError(keyID);
  }
}
