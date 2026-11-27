import type { Migration } from '../types';

export const memoryItemErasureMigration: Migration = {
  name: 'raise the oldest reader for the memory item erasure',

  // The schema keeps its shape. A memory item forget now runs as an erasure of its own kind, which
  // the release before cannot finish, so it must not open a database that holds one.
  up: () => Promise.resolve(),
};
