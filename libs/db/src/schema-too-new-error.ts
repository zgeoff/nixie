import type { StoredSchema } from './types';

// The database holds a schema newer than this build can read. The message names the restore that
// brings the database back to a schema this build reads.
export class SchemaTooNewError extends Error {
  override readonly name = 'SchemaTooNewError';

  constructor(stored: StoredSchema, writes: number, restore: string) {
    super(
      `database schema ${stored.version} needs a build that writes schema ${stored.oldestReader} or later, and this build writes schema ${writes}: ${restore}`,
    );
  }
}
