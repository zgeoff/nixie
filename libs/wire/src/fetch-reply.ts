// The one message the fetcher sends back on its stdout, as one frame. refused means the fetcher
// sent no request for the URL it refused; failed means a request or its reply went wrong.
export type FetchReply =
  | {
      readonly kind: 'page';

      // the final URL after redirects
      readonly url: string;
      readonly status: number;
      readonly contentType: string | null;

      // null for a binary type
      readonly text: string | null;
      readonly isTruncated: boolean;

      // the reason a bot protection answered in place of the page, or null
      readonly blocked: string | null;
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };
