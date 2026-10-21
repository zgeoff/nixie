// GitHub refused a request to the definitions repo, or answered it with a body nixie cannot read.
// The message holds the method, the path and the status, never the token.
export class GitHubRequestError extends Error {
  override readonly name = 'GitHubRequestError';

  // the HTTP status, or null when the body failed to parse
  readonly status: number | null;

  constructor(method: string, path: string, status: number | null, detail: string) {
    super(`GitHub ${method} ${path} failed${status === null ? '' : ` with ${status}`}: ${detail}`);

    this.status = status;
  }
}
