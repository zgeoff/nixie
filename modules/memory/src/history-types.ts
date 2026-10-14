import type { MemoryState, RecalledVersion } from './types';

// One version as the memory view reads it. A version whose key is gone reads as shredded, and one
// whose key or ciphertext fails reads as unreadable, so a forgotten item shows as a gap.
export type HistoryVersion = Omit<
  RecalledVersion,
  'text' | 'evidenceQuote' | 'model' | 'approval'
> &
  (
    | { readonly status: 'readable'; readonly text: string }
    | { readonly status: 'shredded' | 'unreadable' }
  );

export interface ItemHistory {
  readonly itemID: string;
  readonly state: MemoryState;
  readonly versions: readonly HistoryVersion[];
}
