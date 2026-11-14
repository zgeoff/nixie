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
  | { readonly kind: 'refused'; readonly reason: string; readonly isGated: boolean }
  | { readonly kind: 'failed'; readonly reason: string; readonly isGated: boolean };
