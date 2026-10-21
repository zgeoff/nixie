import type { VersionRef } from './types';

export class StaleVersionError extends Error {
  override readonly name = 'StaleVersionError';

  readonly code = 'STALE_VERSION';

  constructor(target: VersionRef, current: number) {
    super(
      `memory item ${target.itemID} is at version ${String(current)}, not the version ${String(target.version)} the caller read`,
    );
  }
}
