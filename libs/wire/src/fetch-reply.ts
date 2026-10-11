// The one message the fetcher sends back on its stdout, as one frame. A page holds the final URL
// after redirects; text is null for a binary type. refused means the fetcher sent no request for
// the URL it refused; failed means a request or its reply went wrong.
export type FetchReply =
  | {
      readonly kind: 'page';
      readonly url: string;
      readonly status: number;
      readonly contentType: string | null;
      readonly text: string | null;
      readonly isTruncated: boolean;
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };
