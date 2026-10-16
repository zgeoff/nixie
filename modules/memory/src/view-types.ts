import type { ContentSource, JSONObject } from '@heynixie/log';
import type {
  MemoryChange,
  MemoryOrigin,
  MemoryState,
  QuoteEvidence,
  RecalledVersion,
  VersionState,
} from './types';

// One version as a host command's history reads it. A version whose key is gone reads as shredded,
// and one whose key or ciphertext fails reads as unreadable, so a forgotten item shows as a gap.
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

// A version's text as the memory view reads it. A version whose key is gone reads as shredded, so a
// forgotten item shows as a gap, and one whose key or ciphertext fails reads as unreadable.
export type ViewText =
  | { readonly status: 'readable'; readonly text: string }
  | { readonly status: 'shredded' | 'unreadable' };

// One item as the memory view lists it: its current version's text while its key exists, where that
// text came from, and when the item was created, last changed and forgotten.
export type ViewItem = ViewText & {
  readonly itemID: string;
  readonly shortID: string;
  readonly state: MemoryState;
  readonly isPinned: boolean;
  readonly version: number;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly createdAt: number;
  readonly changedAt: number;

  // when the forget completed, or null for an item that no forget completed
  readonly forgottenAt: number | null;
};

// The states a page lists: forgotten lists each item a forget began, as a dated gap.
export type ViewListState = 'active' | 'retired' | 'forgotten';

export interface ViewPageRequest {
  readonly state: ViewListState;

  // the cursor a page returned as next
  readonly after?: string;

  // 50 when unset, and never more than 100
  readonly limit?: number;
}

// A page of items in the order they were created, and the cursor for the next page, or null on the
// last one.
export interface ViewPage {
  readonly items: readonly ViewItem[];
  readonly next: string | null;
}

// An active item a query matched, with its keyword score and its similarity, each where that index
// placed it.
export type ViewMatch = ViewItem & {
  readonly score?: number;
  readonly similarity?: number;
};

export interface ViewMatches {
  // best match first
  readonly items: readonly ViewMatch[];
  readonly searchMode: 'hybrid' | 'keyword' | 'keyword-fallback';
}

// The pinned core, in the order you pinned its items, and its size against its budget, in tokens.
export interface PinnedCoreView {
  readonly items: readonly ViewItem[];
  readonly tokens: number;
  readonly budget: number;
}

// The message a version's quote came from. Its text shows while both the item's key and the
// message's key exist, and a forgotten message reads as shredded.
export type EvidenceMessage =
  | { readonly status: 'readable'; readonly text: string }
  | { readonly status: 'shredded' | 'unreadable' | 'missing' };

// Where a version's quote sits in its message, and the message itself, which the view reads only
// while the version's text is readable, so a forgotten item never shows the words it came from.
export interface ViewEvidence extends QuoteEvidence {
  readonly message: EvidenceMessage | null;
}

// One version with its full provenance, as the item's history shows it.
export type ViewVersion = ViewText & {
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly recordedAt: number;

  // the task whose step wrote the version and the proposal it came from, each null when none
  readonly taskID: string | null;
  readonly proposalID: string | null;

  // the verdict of each write check, and the models of the writer's call and of the checker's
  readonly checks: JSONObject | null;
  readonly writerModel: string | null;
  readonly checkerModel: string | null;

  // the quote the text was saved from, null while unreadable or when none exists
  readonly evidenceQuote: string | null;
  readonly evidence: ViewEvidence | null;
};

// One item with every version, oldest first.
export type ViewItemDetail = ViewItem & { readonly versions: readonly ViewVersion[] };

// What the memory view reads. It delivers nothing to a task, so no read takes the delivery lock or
// writes a recall record, as the history a host command reads does not.
export interface MemoryView {
  readonly readPage: (request: ViewPageRequest) => Promise<ViewPage>;

  // active items whose text matches the query, ranked as a recall ranks them
  readonly findItems: (query: string) => Promise<ViewMatches>;
  readonly readPinnedCore: () => Promise<PinnedCoreView>;

  // null when no item has the ID
  readonly readItem: (itemID: string) => Promise<ViewItemDetail | null>;
}
