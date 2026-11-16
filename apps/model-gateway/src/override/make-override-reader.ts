import type { Logger } from '@heynixie/logger';
import type { Override } from '../types';
import { readOverride } from './read-override';

// Reads the override that binds, or null when the config names no file or the file holds none. A
// file that cannot be read binds nothing, and is logged once per process.
export function makeOverrideReader(
  path: string | null,
  log: Logger,
): () => Promise<Override | null> {
  let failureLogged = false;

  return async () => {
    if (path === null) {
      return null;
    }

    const read = await readOverride(path);

    if (read.kind === 'unreadable' && !failureLogged) {
      failureLogged = true;

      log('override.unreadable', { reason: read.reason }, 'error');
    }

    return read.kind === 'found' ? read.override : null;
  };
}
