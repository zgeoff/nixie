export class KeyStoreBusyError extends Error {
  override readonly name = 'KeyStoreBusyError';

  constructor(keyID: string | null) {
    super(formatBusyMessage(keyID));
  }
}

function formatBusyMessage(keyID: string | null): string {
  return keyID === null
    ? 'the key store checkpoint left WAL frames in place'
    : `the key store checkpoint after removing key ${keyID} left WAL frames in place`;
}
