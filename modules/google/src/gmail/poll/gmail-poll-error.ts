// A poll of one connection that failed. The cursor stays where it was, and the source polls again
// after the backoff, or after Google's own retry time when that is longer.
export class GmailPollError extends Error {
  readonly retryAfterMs: number | null;

  constructor(reason: string, retryAfterMs: number | null = null) {
    super(reason);

    this.name = 'GmailPollError';
    this.retryAfterMs = retryAfterMs;
  }
}
