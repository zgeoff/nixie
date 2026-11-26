import type { InboxKind } from '../types';

let added: readonly InboxKind[] = [];

// The server sets the list at the start of each server, before any part starts. A feature that is
// off adds none.
export const inboxKinds = {
  set: (kinds: readonly InboxKind[]): void => {
    added = kinds;
  },
  list: (): readonly InboxKind[] => added,
  byKind: (kind: string): InboxKind | null => added.find((entry) => entry.kind === kind) ?? null,
};
