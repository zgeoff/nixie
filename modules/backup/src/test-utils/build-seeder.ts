import { buildLogSeeder } from '@heynixie/log/test-utils';
import type { LogSeederDeps } from '@heynixie/log/test-utils';
import type { BackupSeederDeps } from './build-backup-seeder';
import { buildBackupSeeder } from './build-backup-seeder';

export type TestDeps = BackupSeederDeps & LogSeederDeps;

export function buildSeeder(deps: TestDeps) {
  const logSeeder = buildLogSeeder(deps);

  return {
    ...logSeeder,
    ...buildBackupSeeder(deps),
    finishedErasure: () =>
      logSeeder.record({
        kind: 'erasure.finished',
        payload: {
          erasureID: 'erasure-a',
          kind: 'note',
          targetID: 'note-a',
          shortID: 'n4w8k2c6rd',
          by: 'user',
          removedKeys: 1,
        },
      }),
  };
}
