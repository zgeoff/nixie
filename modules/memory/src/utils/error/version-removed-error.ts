import type { VersionRef } from '../../types';

export class VersionRemovedError extends Error {
  override readonly name = 'VersionRemovedError';

  readonly code = 'VERSION_REMOVED';

  constructor(ref: VersionRef) {
    super(
      `version ${String(ref.version)} of memory item ${ref.itemID} was removed with the message it quoted`,
    );
  }
}
