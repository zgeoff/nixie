import type { SearchMode } from './types';

// A search of your past messages by keyword and by meaning, as per-turn retrieval runs one.
export interface MessageRecallRequest {
  readonly query: string;
  readonly limit: number;

  // the lowest keyword score a match keeps
  readonly minScore: number;

  // the lowest similarity a semantic match keeps
  readonly minSimilarity: number;

  // the sequences of the messages the reader already holds, which stay out before the limit applies
  readonly excludedSequences: readonly number[];

  // leaves out each query word that stems the same as a word of one of these, as for items
  readonly excludedWords: readonly string[];
}

// One past message of yours, as retrieval places it: its record's sequence and thread, when it was
// recorded, and its text as the conversation renders it, cut when long.
export interface PastMessage {
  readonly sequence: number;

  // null for a message recorded on no thread
  readonly thread: string | null;
  readonly recordedAt: number;
  readonly text: string;
  readonly isCut: boolean;
}

export interface MessageRecallResult {
  readonly messages: readonly PastMessage[];
  readonly searchMode: SearchMode;
}
