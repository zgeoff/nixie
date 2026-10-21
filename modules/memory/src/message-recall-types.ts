import type { SearchMode } from './types';

export interface MessageRecallRequest {
  readonly query: string;
  readonly limit: number;

  readonly minScore: number;

  readonly minSimilarity: number;

  readonly excludedSequences: readonly number[];

  readonly excludedWords: readonly string[];
}

export interface PastMessage {
  readonly sequence: number;

  readonly thread: string | null;
  readonly recordedAt: number;
  readonly text: string;
  readonly isCut: boolean;
}

export interface MessageRecallResult {
  readonly messages: readonly PastMessage[];
  readonly searchMode: SearchMode;
}
