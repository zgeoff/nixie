import { bodyFieldReaders } from '@heynixie/api';
import { readGoogleBodyFields } from '@heynixie/connector-google';

interface GoogleListsConfig {
  readonly google?: unknown;
}

// Fills the core lists that Google adds to, and empties them when it is off. It runs before any
// part starts.
export function fillGoogleLists(config: GoogleListsConfig): void {
  const readers = config.google === undefined ? [] : [readGoogleBodyFields];

  bodyFieldReaders.set(readers);
}
