export interface FetchLimits {
  // The fetcher counts the body after decompression, so a compressed body cannot pass the limit.
  readonly bodyBytes: number;

  readonly timeoutMs: number;
  readonly redirects: number;

  readonly textBytes: number;
}

export interface FetchRequest {
  readonly url: string;
  readonly limits: FetchLimits;

  readonly deniedRanges: readonly string[];
}
