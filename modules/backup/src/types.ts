import type { CheckedTables } from '@heynixie/db';
import type { DataStorage, LegacyEnd, Writer } from '@heynixie/log';
import type { BackupSetKind } from '@heynixie/wire';

export type BackupSetState = 'staging' | 'staged' | 'published' | 'failed' | 'abandoned';

export type BackupWriter = Pick<Writer, 'clock' | 'commits' | 'dataDir' | 'db' | 'epoch'>;

export interface BackupContext {
  readonly writer: BackupWriter;
  readonly storage: DataStorage;

  // the end records of the forgets that predate the erasure records; the server passes the ones
  // that its erasable descriptors name, because this module imports no store
  readonly legacyEnds?: readonly LegacyEnd[];
}

export type BackupNoticeCause = 'failed' | 'missing';

export interface BackupNotice {
  readonly sequence: number;
  readonly cause: BackupNoticeCause;
  readonly raisedAt: number;
}

export type BackupTables = CheckedTables<
  Readonly<{
    backup_notices: {
      readonly sequence: number;
      readonly cause: BackupNoticeCause;
      readonly raised_at: number;
    };
    backup_sets: {
      readonly sequence: number;
      readonly kind: BackupSetKind;
      readonly state: BackupSetState;
      readonly log_head: number;
      readonly staged_at: number;
      readonly received_at: number | null;
      readonly data_snapshot_id: string | null;
      readonly key_snapshot_id: string | null;
      readonly receipt: string | null;
    };
    records: {
      readonly sequence: number;
      readonly kind: string;
      readonly payload: string;
    };
  }>,
  'records'
>;
