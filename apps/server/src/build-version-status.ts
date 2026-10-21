import type { StatusEntry } from '@heynixie/sessions';
import { nixieVersion } from './nixie-version';

export function buildVersionStatus(version: string = nixieVersion): StatusEntry {
  return {
    name: 'nixie_version',
    read: () => Promise.resolve({ value: version, text: `nixie version: ${version}` }),
  };
}
