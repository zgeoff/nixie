import type { Logger } from '@heynixie/logger';

export interface RelatedMemoryItem {
  readonly shortID: string;
  readonly text: string;
}

// What a tool takes to look up the memory that its call's text touches. The memory module owns the
// lookup, and the composition root passes it in.
export interface RelatedMemoryLookup {
  readonly read: (text: string) => Promise<readonly RelatedMemoryItem[]>;
  readonly log: Logger;
}
