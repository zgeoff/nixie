import type { BodyFieldReader } from '@heynixie/api';
import { bodyFieldReaders } from '@heynixie/api';
import { readPackageBodyFields } from '@heynixie/devices';
import { readGoogleBodyFields } from '@heynixie/google';
import { buildGoogleToolkit } from '../google/build-google-toolkit';

interface BodyFieldReadersConfig {
  readonly google?: unknown;
  readonly devices?: unknown;
}

// Fills the list of readers that add fields to an action's card with the readers of the features
// that are on, and empties it when none is. It runs before any part starts.
export function fillBodyFieldReaders(config: BodyFieldReadersConfig): void {
  const readers: readonly BodyFieldReader[] = [
    ...(config.google === undefined
      ? []
      : [
          (...args: Parameters<BodyFieldReader>) =>
            readGoogleBodyFields(buildGoogleToolkit(), ...args),
        ]),
    ...(config.devices === undefined ? [] : [readPackageBodyFields]),
  ];

  bodyFieldReaders.set(readers);
}
