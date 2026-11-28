import type { ConnectorFailure } from '@heynixie/tools';
import type { ImageSize } from './image/image-size';

export type { ConnectorFailure } from '@heynixie/tools';

export type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  Connector,
  ConnectorAction,
  ConnectorContext,
  ConnectorLookup,
  ConnectionRef,
  HealthReport,
  MissingScope,
  OAuthSpec,
  ProviderFetch,
  ProviderResponse,
  Reconcile,
  SetupLink,
  SetupStep,
} from '@heynixie/connections';

export { defaultTrustNegativeAfterMs } from '@heynixie/connections';

export type SearchFreshness = 'day' | 'week' | 'month';

export interface SearchRequest {
  readonly query: string;
  readonly limit: number;

  // the domains a hit must come from; empty for any domain
  readonly sites: readonly string[];

  // how recently a hit's page was published or updated; null for any time
  readonly freshness: SearchFreshness | null;
}

export interface SearchHit {
  // plain text, with no markup
  readonly title: string;
  readonly url: string;

  // plain text, with no markup
  readonly snippet: string | null;

  // the day the provider says the page was created or last updated, such as 2026-11-06; null when
  // it gives none
  readonly date: string | null;
}

export type SearchReply =
  | { readonly kind: 'hits'; readonly hits: readonly SearchHit[] }
  | { readonly kind: 'failed'; readonly failure: ConnectorFailure };

export interface SearchProvider {
  // `signal` aborts when the call's time budget ends
  readonly readHits: (request: SearchRequest, signal?: AbortSignal) => Promise<SearchReply>;
}

export interface DrawImage {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface DrawRequest {
  readonly model: string;
  readonly prompt: string;
  readonly size: ImageSize;

  // an edit: the stored image, sent whole
  readonly source?: DrawImage;

  // up to 4, each a PNG of at most 8 MiB
  readonly references: readonly DrawImage[];

  // aborts when the call passes its time limit
  readonly signal: AbortSignal;
}

// the image is at most 8 MiB
export type DrawReply =
  | { readonly kind: 'image'; readonly mediaType: string; readonly bytes: Uint8Array }
  | {
      readonly kind: 'refused';
      readonly reason: 'safety' | 'other';
      readonly message: string;
      readonly isBilled: boolean;
    }

  // the reason never holds the key
  | { readonly kind: 'failed'; readonly reason: string; readonly isBilled: boolean };

export interface ImageProvider {
  // what the provider's API takes beside the prompt
  readonly takes: { readonly source: boolean; readonly references: boolean };

  readonly draw: (request: DrawRequest) => Promise<DrawReply>;
}
