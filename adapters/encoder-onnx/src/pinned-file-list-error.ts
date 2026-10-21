export class PinnedFileListError extends Error {
  override readonly name = 'PinnedFileListError';

  readonly code = 'PINNED_FILE_LIST';

  constructor(line: string) {
    super(`the pinned file list has a line that is not a path, a URL and a SHA-256: ${line}`);
  }
}
