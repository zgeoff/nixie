import type { StatusEntry } from '@heynixie/models';
import { nixieVersion } from './nixie-version';

// The status entry for the nixie version that opened the session.
export function buildVersionStatus(version: string = nixieVersion): StatusEntry {
  return {
    name: 'nixie_version',
    read: () => Promise.resolve({ value: version, text: `nixie version: ${version}` }),
  };
}
