import type { ContentSource, JSONObject } from '@heynixie/log';
import type { ReviewReason } from './gate-types';
import type { QuoteEvidence } from './types';

// What the content gate checks: the memory's text, the quote that backs it and the thread it came
// from.
export interface ContentGateRequest {
  readonly text: string;
  readonly quote: string | null;

  // the record the quote cites, or null to search your latest messages
  readonly eventID: number | null;
  readonly isPinned: boolean;
  readonly thread: string;
}

// A gate's outcome: the write applies with the source and checks it earned, or it waits for review
// with its reason. Each carries the verdict of every check that ran.
export type ContentGateResult =
  | {
      readonly status: 'pass';
      readonly source: ContentSource;
      readonly evidence: QuoteEvidence | null;
      readonly checks: JSONObject;
    }
  | {
      readonly status: 'review';
      readonly reason: ReviewReason;
      readonly evidence: QuoteEvidence | null;
      readonly checks: JSONObject;

      // the checker's one-sentence reason, which the proposal card shows
      readonly checkerReason: string | null;
    };
