import { sql } from 'kysely';
import { KeyStoreBusyError } from './key-store-busy-error';
import type { Log } from './types';

// Moves every frame out of the key store's WAL and truncates it, so a deleted key leaves no copy on
// disk. It throws when another connection's read held frames in place; a later call finishes the
// checkpoint. The key names the removal it follows, or is null for a checkpoint on its own.
export async function writeKeyStoreCheckpoint(
  log: Pick<Log, 'writer'>,
  keyID: string | null,
): Promise<void> {
  const result = await sql<CheckpointResult>`pragma wal_checkpoint(truncate)`.execute(
    log.writer.keys,
  );

  const checkpoint = result.rows.at(0);

  if (
    checkpoint === undefined ||
    checkpoint.busy !== 0 ||
    checkpoint.log !== checkpoint.checkpointed
  ) {
    throw new KeyStoreBusyError(keyID);
  }
}

interface CheckpointResult {
  readonly busy: number;
  readonly log: number;
  readonly checkpointed: number;
}
