// A downloaded file's SHA-256 differs from the one the repo records, so the file is not the one
// pinned and the download writes nothing.
export class ChecksumMismatchError extends Error {
  override readonly name = 'ChecksumMismatchError';

  readonly code = 'CHECKSUM_MISMATCH';

  constructor(path: string, expected: string, actual: string) {
    super(`${path} has SHA-256 ${actual}, not the ${expected} the repo records`);
  }
}
