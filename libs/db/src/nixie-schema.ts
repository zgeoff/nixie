import { join } from 'node:path';
import { readMigrations } from './read-migrations';
import type { BuildSchema } from './types';

export const nixieSchema: BuildSchema = {
  migrations: await readMigrations(join(import.meta.dir, 'migrations')),
  oldestReader: 35,
};
