export interface FetchLimits {
  // The fetcher counts the body after decompression, so a compressed body cannot pass the limit.
  readonly bodyBytes: number;

  readonly timeoutMs: number;
  readonly redirects: number;

  readonly textBytes: number;

  // the most body bytes of an image/* type; a longer body returns no image
  readonly imageBytes: number;
}

export interface FetchRequest {
  readonly url: string;
  readonly limits: FetchLimits;

  readonly deniedRanges: readonly string[];

  // 'ask': the fetcher sends a hop frame and waits for a pass before each hop after hop 0
  readonly hops: 'ask' | 'none';
}
