// The key store checkpoint could not finish, because another connection held a read on keys.db, so
// a deleted key may still sit in its WAL. A retry of the removal or of the checkpoint finishes it.
export class KeyStoreBusyError extends Error {
  override readonly name = 'KeyStoreBusyError';

  // the key whose removal the checkpoint followed, or null for a checkpoint on its own
  constructor(keyID: string | null) {
    super(formatBusyMessage(keyID));
  }
}

function formatBusyMessage(keyID: string | null): string {
  return keyID === null
    ? 'the key store checkpoint left WAL frames in place'
    : `the key store checkpoint after removing key ${keyID} left WAL frames in place`;
}
