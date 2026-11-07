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
    }
  | {
      readonly kind: 'image';

      readonly url: string;
      readonly status: number;
      readonly contentType: string | null;

      // the whole body, as the site sent it, within the image limit
      readonly base64: string;
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };
