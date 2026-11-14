import { recoveryStartedCodec } from './recovery-started-codec';
import type { LogTables, Projection } from './types';

export const recoveriesProjection: Projection = {
  table: 'recoveries',
  keyColumn: 'recovery_id',
  fold: async (tx, record) => {
    if (record.thread !== null || record.kind !== 'recovery.started') {
      return [];
    }

    const payload = recoveryStartedCodec.decode(record.payload);

    await tx
      .$extendTables<LogTables>()
      .insertInto('recoveries')
      .values({
        recovery_id: payload.recoveryID,
        restored_at: payload.restoredAt,
        backup_taken_at: payload.backupTakenAt,
        started_sequence: record.sequence,
      })
      .onConflict((conflict) => conflict.column('recovery_id').doNothing())
      .execute();

    return [payload.recoveryID];
  },
};
