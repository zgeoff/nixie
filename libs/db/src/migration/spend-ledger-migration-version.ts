import invariant from 'tiny-invariant';
import { spendLedgerMigration } from '../migrations/0089-spend-ledger-migration';
import { nixieSchema } from '../schema/nixie-schema';

const index = nixieSchema.migrations.indexOf(spendLedgerMigration);

invariant(index !== -1, 'the spend ledger migration is not in nixieSchema');
export const spendLedgerMigrationVersion = index + 1;
