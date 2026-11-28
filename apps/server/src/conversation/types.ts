import type { ImageProvider, ImagesConfig, SearchProvider } from '@heynixie/connectors';

export interface ConversationSearch {
  readonly provider: SearchProvider;
  readonly dailyCallCap: number;
  readonly priceMicros: number;
}

export interface ConversationImages {
  readonly config: ImagesConfig;
  readonly providers: Readonly<Record<string, ImageProvider>>;
}
