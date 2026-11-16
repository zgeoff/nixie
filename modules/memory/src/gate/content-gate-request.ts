import type { ContentSource, JSONObject } from '@heynixie/log';
import type { QuoteEvidence } from '../types';
import type { ReviewReason } from './gate-context';

export interface ContentGateRequest {
  readonly text: string;

  // the gist, the topic and each trigger phrase, which the checks read beside the text
  readonly labelTexts?: readonly string[];
  readonly quote: string | null;

  readonly eventID: number | null;
  readonly isPinned: boolean;
  readonly thread: string;

  // the thread a cited event is read from
  readonly logThread: string;

  readonly until: number | null;
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
