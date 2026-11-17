import invariant from 'tiny-invariant';
import { spendStopMigration } from '../migrations/0068-spend-stop-migration';
import { nixieSchema } from '../schema/nixie-schema';

const index = nixieSchema.migrations.indexOf(spendStopMigration);

invariant(index !== -1, 'the spending stop migration is not in nixieSchema');
export const spendMigrationVersion = index + 1;
