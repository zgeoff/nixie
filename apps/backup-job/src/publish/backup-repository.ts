import type { BackupSetKind } from '@heynixie/wire';
import type { DataRetention } from '../parse-job-config';

export interface PublishedSnapshot {
  readonly snapshotID: string;
  readonly writtenAt: number;
  readonly set: number | null;
  readonly kind: BackupSetKind | null;
  readonly publish: number | null;
  readonly legacySet: number | null;
  readonly provenFrom: number | null;
}

export interface BackupRepository {
  readonly createRepository: () => Promise<void>;
  readonly writeSnapshot: (path: string, name: string, tags: readonly string[]) => Promise<string>;
  readonly readSnapshots: () => Promise<readonly PublishedSnapshot[]>;
  readonly restoreSnapshot: (snapshotID: string, directory: string) => Promise<void>;
  readonly removeSnapshots: (snapshotIDs: readonly string[]) => Promise<void>;
  readonly runRetention: (retention: DataRetention) => Promise<void>;
  readonly runPrune: () => Promise<void>;
  readonly runCheck: () => Promise<void>;
}
