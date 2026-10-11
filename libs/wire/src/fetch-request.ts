// The limits of one fetch, which nixie sets from its config and the fetcher enforces.
export interface FetchLimits {
  // the most body bytes the fetcher reads, after it decodes a compressed body
  readonly bodyBytes: number;

  // the whole call, with its redirects
  readonly timeoutMs: number;
  readonly redirects: number;

  // the most bytes of UTF-8 text the result returns
  readonly textBytes: number;
}

// The one message nixie sends the fetcher on its stdin, as one frame.
export interface FetchRequest {
  readonly url: string;
  readonly limits: FetchLimits;

  // the ranges the deployment lists as internal, which the fetcher refuses whatever their class
  readonly deniedRanges: readonly string[];
}
