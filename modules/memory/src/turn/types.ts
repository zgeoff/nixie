import type { MemoryRef, TurnMemoryAsk } from '@heynixie/sessions';
import type { MemoryIndex } from '../memory/start-memory-index';
import type { SearchMode } from '../types';
import type { MatchScores } from '../view/merge-rankings';
import type { VectorIndex } from '../view/start-vector-index';
import type { TriggerIndex } from './start-trigger-index';

export interface TurnMemorySettings {
  readonly trigger: {
    // the most items trigger push places on a turn; 0 turns it off
    readonly items: number;
    readonly minScore: number;
    readonly minSimilarity: number;
  };
}

export interface ItemState {
  readonly itemID: string;

  // the text version
  readonly version: number;
  readonly isPinned: boolean;
  readonly isSelf: boolean;

  // its end time passed
  readonly isLapsed: boolean;
}

export interface PushPick extends MemoryRef, MatchScores {
  readonly isSelf: boolean;
}

export interface WrittenItemsQuery {
  readonly thread: string;
  readonly afterSequence: number;
}

export interface TurnSources {
  readonly index: MemoryIndex;

  // null with no encoder
  readonly vectors: VectorIndex | null;
  readonly triggers: TriggerIndex;
  readonly readItemStates: () => Promise<readonly ItemState[]>;

  // the items that a memory write on the thread touched after the sequence
  readonly readWrittenItemIDs: (query: WrittenItemsQuery) => Promise<readonly string[]>;
}

interface PushResult {
  readonly picks: readonly PushPick[];

  // how each search behind a pick ran
  readonly searchModes: readonly SearchMode[];
}

type PushTurn = TurnMemoryAsk & {
  readonly states: readonly ItemState[];
  readonly excludedIDs: readonly string[];
};

export type SelectPush = (sources: TurnSources, turn: PushTurn) => Promise<PushResult>;
