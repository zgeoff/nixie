import type { VersionRef } from './types';

// The item moved on since the caller read it, so the write would overwrite a change the caller
// never saw. The caller reads the item again and decides.
export class StaleVersionError extends Error {
  override readonly name = 'StaleVersionError';
  readonly code = 'STALE_VERSION';

  constructor(target: VersionRef, current: number) {
    super(
      `memory item ${target.itemID} is at version ${String(current)}, not the version ${String(target.version)} the caller read`,
    );
  }
}
