// The key store checkpoint could not finish, because another connection held a read on keys.db, so
// a deleted key may still sit in its WAL. A retry of the removal finishes the checkpoint.
export class KeyStoreBusyError extends Error {
  override readonly name = 'KeyStoreBusyError';

  constructor(keyID: string) {
    super(`the key store checkpoint after removing key ${keyID} left WAL frames in place`);
  }
}
