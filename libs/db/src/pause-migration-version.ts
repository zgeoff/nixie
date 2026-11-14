import invariant from 'tiny-invariant';
import { pauseMigration } from './migrations/0045-pause-migration';
import { nixieSchema } from './nixie-schema';

const index = nixieSchema.migrations.indexOf(pauseMigration);

invariant(index !== -1, 'the pause migration is not in nixieSchema');
export const pauseMigrationVersion = index + 1;
