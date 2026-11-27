import { bodyFieldReaders } from '@heynixie/api';
import type { BodyFieldReader } from '@heynixie/api';
import { readGoogleBodyFields } from '@heynixie/google';
import { buildGoogleToolkit } from './build-google-toolkit';

interface GoogleListsConfig {
  readonly google?: unknown;
}

// Fills the core lists that Google adds to, and empties them when it is off. It runs before any
// part starts.
export function fillGoogleLists(config: GoogleListsConfig): void {
  const readers: readonly BodyFieldReader[] =
    config.google === undefined
      ? []
      : [
          (log, request, defaultZone) =>
            readGoogleBodyFields(buildGoogleToolkit(), log, request, defaultZone),
        ];

  bodyFieldReaders.set(readers);
}
