export class ChecksumMismatchError extends Error {
  override readonly name = 'ChecksumMismatchError';

  readonly code = 'CHECKSUM_MISMATCH';

  constructor(path: string, expected: string, actual: string) {
    super(`${path} has SHA-256 ${actual}, not the ${expected} the repo records`);
  }
}
