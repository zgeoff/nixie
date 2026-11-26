import type { Logger } from '@heynixie/logger';
import type { Overrides } from '../types';
import { readOverride } from './read-override';

// Reads the overrides that bind, or none when the config names no file or the file holds none. A
// file that cannot be read binds nothing, and is logged once per process.
export function makeOverrideReader(path: string | null, log: Logger): () => Promise<Overrides> {
  let failureLogged = false;

  return async () => {
    if (path === null) {
      return {};
    }

    const read = await readOverride(path);

    if (read.kind === 'unreadable' && !failureLogged) {
      failureLogged = true;

      log('override.unreadable', { reason: read.reason }, 'error');
    }

    return read.kind === 'found' ? read.overrides : {};
  };
}
