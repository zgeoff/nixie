import type { Writer } from '@heynixie/log';
import type { BackupSetKind } from '@heynixie/wire';
import type { BackupSetState, BackupTables } from '../types';

export interface TestBackupSet {
  readonly sequence: number;
  readonly kind: BackupSetKind;
  readonly state: BackupSetState;
}

export function readTestBackupSets(writer: Pick<Writer, 'db'>): Promise<readonly TestBackupSet[]> {
  return writer.db
    .$extendTables<BackupTables>()
    .selectFrom('backup_sets')
    .select(['sequence', 'kind', 'state'])
    .orderBy('sequence')
    .execute();
}
