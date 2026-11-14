import { buildLogSeeder } from '@heynixie/log/test-utils';
import type { LogSeederDeps } from '@heynixie/log/test-utils';
import type { BackupSeederDeps } from './build-backup-seeder';
import { buildBackupSeeder } from './build-backup-seeder';

export type TestDeps = BackupSeederDeps & LogSeederDeps;

export function buildSeeder(deps: TestDeps) {
  return { ...buildLogSeeder(deps), ...buildBackupSeeder(deps) };
}
