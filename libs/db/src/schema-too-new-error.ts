import type { StoredSchema } from './types';

export class SchemaTooNewError extends Error {
  override readonly name = 'SchemaTooNewError';

  constructor(stored: StoredSchema, writes: number, restore: string) {
    super(
      `database schema ${stored.version} needs a build that writes schema ${stored.oldestReader} or later, and this build writes schema ${writes}: ${restore}`,
    );
  }
}
