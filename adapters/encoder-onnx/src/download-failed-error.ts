export class DownloadFailedError extends Error {
  override readonly name = 'DownloadFailedError';

  readonly code = 'DOWNLOAD_FAILED';

  constructor(url: string, status: number) {
    super(`${url} answered HTTP ${String(status)}`);
  }
}
