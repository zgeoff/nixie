import type { ContentSource, JSONObject } from '@heynixie/log';
import type { MemoryNotice, MemoryProposal, NoticeEntry } from './gate-types';
import type { MemoryExportRequest } from './read-memory-export';
import type {
  ForgetStatus,
  MemoryChange,
  MemoryOrigin,
  MemoryState,
  MemorySubject,
  QuoteEvidence,
  RecalledVersion,
  VersionRef,
  VersionState,
} from './types';

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
  readonly subject: MemorySubject;
  readonly versions: readonly HistoryVersion[];
}

export type ViewText =
  | { readonly status: 'readable'; readonly text: string }
  | { readonly status: 'shredded' | 'unreadable' };

export type ViewItem = ViewText & {
  readonly itemID: string;
  readonly shortID: string;
  readonly state: MemoryState;
  readonly isPinned: boolean;

  readonly isSensitive: boolean;

  readonly subject: MemorySubject;
  readonly version: number;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly createdAt: number;
  readonly changedAt: number;

  readonly forgottenAt: number | null;

  readonly until: number | null;
};

export type ViewListState = 'active' | 'retired' | 'forgotten';

export interface ViewPageRequest {
  readonly state: ViewListState;

  readonly after?: string;

  readonly limit?: number;

  readonly subjects?: readonly MemorySubject[];
}

export interface ViewPage {
  readonly items: readonly ViewItem[];
  readonly next: string | null;
}

export type ViewMatch = ViewItem & {
  readonly score?: number;
  readonly similarity?: number;
};

export interface ViewMatches {
  readonly items: readonly ViewMatch[];
  readonly searchMode: 'hybrid' | 'keyword' | 'keyword-fallback';
}

export interface PinnedCoreView {
  readonly items: readonly ViewItem[];
  readonly tokens: number;
  readonly budget: number;
}

export type EvidenceMessage =
  | { readonly status: 'readable'; readonly text: string }
  | { readonly status: 'shredded' | 'unreadable' | 'missing' };

export interface ViewEvidence extends QuoteEvidence {
  readonly message: EvidenceMessage | null;
}

export type ViewVersion = ViewText & {
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly recordedAt: number;

  readonly taskID: string | null;
  readonly proposalID: string | null;

  readonly checks: JSONObject | null;
  readonly writerModel: string | null;
  readonly checkerModel: string | null;

  readonly evidenceQuote: string | null;
  readonly evidence: ViewEvidence | null;
};

export type ViewItemDetail = ViewItem & { readonly versions: readonly ViewVersion[] };

export interface ForgetLoss {
  readonly evidenceMessages: number;
  readonly proposals: number;
}

export type ForgetPreview = ViewItemDetail & { readonly lost: ForgetLoss };

export interface RetiredForgetPreview {
  readonly items: readonly (ViewItem & { readonly lost: ForgetLoss })[];
  readonly hasMore: boolean;
}

export type ViewNoticeKind = 'turn' | 'batch' | 'catch_up' | 'run';

export interface ViewNoticeEntry extends NoticeEntry {
  readonly item: (ViewItem & { readonly change: MemoryChange }) | null;
}

export interface ViewNotice extends Omit<MemoryNotice, 'thread' | 'entries'> {
  readonly kind: ViewNoticeKind;
  readonly messageSequence: number | null;
  readonly sequence: number;
  readonly entries: readonly ViewNoticeEntry[];
}

export interface MemoryView {
  readonly readPage: (request: ViewPageRequest) => Promise<ViewPage>;

  readonly readMatchingItems: (query: string) => Promise<ViewMatches>;
  readonly readPinnedCore: () => Promise<PinnedCoreView>;

  readonly readItem: (itemID: string) => Promise<ViewItemDetail | null>;

  readonly readProposals: () => Promise<readonly ViewProposal[]>;

  readonly readForgetPreview: (target: VersionRef) => Promise<ForgetPreview>;

  readonly readRetiredForgetPreview: () => Promise<RetiredForgetPreview>;

  readonly readForgetStatus: (itemIDs: readonly string[]) => Promise<ForgetStatus>;

  readonly readNotices: (thread: string) => Promise<readonly ViewNotice[]>;

  readonly readExport: (request: MemoryExportRequest) => AsyncIterable<string>;
}

export type ViewProposal = Omit<MemoryProposal, 'evidence'> & {
  readonly evidence: ViewEvidence | null;
};
