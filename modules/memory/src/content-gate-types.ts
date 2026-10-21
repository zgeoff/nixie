import type { ContentSource, JSONObject } from '@heynixie/log';
import type { ReviewReason } from './gate-types';
import type { QuoteEvidence } from './types';

export interface ContentGateRequest {
  readonly text: string;
  readonly quote: string | null;

  readonly eventID: number | null;
  readonly isPinned: boolean;
  readonly thread: string;
}

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

      readonly checkerReason: string | null;
    };
