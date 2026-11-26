export interface FetchLimits {
  // The fetcher counts the body after decompression, so a compressed body cannot pass the limit.
  readonly bodyBytes: number;

  readonly timeoutMs: number;
  readonly redirects: number;

  readonly textBytes: number;

  // the most body bytes of an image/* type; a longer body returns no image
  readonly imageBytes: number;
}

// What the fetcher returns for the URL. A page is the default. A body is the response's text as
// the site sent it, with no reading of HTML. A package is an npm tarball that the fetcher checks
// against `integrity`, unpacks and refuses past `unpackedBytes`.
export type FetchMode =
  | { readonly kind: 'body' }
  | { readonly kind: 'package'; readonly integrity: string; readonly unpackedBytes: number };

// The most files of one unpacked package, so a reply holds each path.
export const maxPackageFiles = 2000;

export interface FetchRequest {
  readonly url: string;
  readonly limits: FetchLimits;

  readonly deniedRanges: readonly string[];

  // 'ask': the fetcher sends a hop frame and waits for a pass before each hop after hop 0
  readonly hops: 'ask' | 'none';

  // The HTML of a document that the host already holds, such as a mail's. The fetcher reads its
  // text and its links the way it reads a page, makes no request, and takes `url` as the address
  // that relative links resolve against.
  readonly html?: string;

  // absent for a page
  readonly mode?: FetchMode;
}

// The most bytes of one request frame. A request that carries HTML needs room for the document.
export const maxFetchRequestBytes = 8_388_608;

// The most characters of HTML that a request carries, which JSON escapes to fit one frame.
export const maxFetchHTMLChars = 1_000_000;
