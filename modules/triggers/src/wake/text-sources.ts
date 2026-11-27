let current: readonly string[] = [];

// The IDs of the text sources that features fill. The server sets the list at the start of each
// server, before any part starts, and a feature that is off adds none.
export const textSources = {
  set: (next: readonly string[]): void => {
    current = next;
  },
  list: (): readonly string[] => current,
  has: (sourceID: string): boolean => current.includes(sourceID),
};
