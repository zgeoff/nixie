export class GitHubRequestError extends Error {
  override readonly name = 'GitHubRequestError';

  readonly status: number | null;

  constructor(method: string, path: string, status: number | null, detail: string) {
    super(`GitHub ${method} ${path} failed${status === null ? '' : ` with ${status}`}: ${detail}`);

    this.status = status;
  }
}
