import type { MigrationReport } from '@heynixie/db';
import { spendLedgerMigrationVersion } from '@heynixie/db';

// whether this start ran the migration that keyed the budget charges, so it logs once what that
// migration could not count
export function isSpendLedgerUpgrade(migration: MigrationReport): boolean {
  return (
    migration.from < spendLedgerMigrationVersion && migration.to >= spendLedgerMigrationVersion
  );
}
