import type { StartCursorStore } from '@heynixie/coding';

// A start cursor store in memory. Two adapters that share one store stand for a server before and
// after a restart over one database.
export function buildMemoryCursorStore(): StartCursorStore {
  const cursors = new Map<string, string>();

  return {
    read: (idempotencyKey) => Promise.resolve(cursors.get(idempotencyKey) ?? null),
    write: (idempotencyKey, cursor) => {
      if (!cursors.has(idempotencyKey)) {
        cursors.set(idempotencyKey, cursor);
      }

      return Promise.resolve();
    },
    remove: (idempotencyKey) => {
      cursors.delete(idempotencyKey);

      return Promise.resolve();
    },
  };
}
