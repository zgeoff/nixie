export type FetchReply =
  | {
      readonly kind: 'page';

      readonly url: string;
      readonly status: number;
      readonly contentType: string | null;

      readonly text: string | null;

      // the target of each link the text marks, by the index its mark names
      readonly links: readonly string[];
      readonly isTruncated: boolean;

      readonly blocked: string | null;

      // the wait in ms that the reply's headers ask for, null when they ask for none
      readonly retryAfterMs: number | null;

      // true when the fetcher asked the server before each hop; the decoder reads a missing field as false
      readonly isGated: boolean;
    }
  | {
      readonly kind: 'image';

      readonly url: string;
      readonly status: number;
      readonly contentType: string | null;

      // the whole body, as the site sent it, within the image limit
      readonly base64: string;

      // the wait in ms that the reply's headers ask for, null when they ask for none
      readonly retryAfterMs: number | null;

      // true when the fetcher asked the server before each hop; the decoder reads a missing field as false
      readonly isGated: boolean;
    }
  | {
      // the response's text as the site sent it, cut at the body limit
      readonly kind: 'body';

      readonly url: string;
      readonly status: number;
      readonly contentType: string | null;

      readonly text: string;
      readonly isTruncated: boolean;
      readonly retryAfterMs: number | null;
      readonly isGated: boolean;
    }
  | {
      // the files of a package whose tarball matched the integrity the request named
      readonly kind: 'package';

      readonly url: string;
      readonly files: readonly { readonly path: string; readonly base64: string }[];
      readonly isGated: boolean;
    }
  | { readonly kind: 'refused'; readonly reason: string; readonly isGated: boolean }
  | { readonly kind: 'failed'; readonly reason: string; readonly isGated: boolean };

// the replies of a fetch of a page, which never holds a body or a package
export type PageReply = Exclude<FetchReply, { readonly kind: 'body' | 'package' }>;

// the replies of a fetch for a response body
export type BodyReply = Extract<FetchReply, { readonly kind: 'body' | 'refused' | 'failed' }>;

// the replies of a fetch for a package
export type PackageReply = Extract<FetchReply, { readonly kind: 'package' | 'refused' | 'failed' }>;
