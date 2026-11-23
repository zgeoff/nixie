import type { MemorySubject } from '../types';
import type { TopicRow } from './collect-topic-rows';

export interface TopicRequest {
  readonly subjects?: readonly MemorySubject[];

  // the decimal offset of the first entry to return
  readonly offset: number;
}

export interface EntryPage<T> {
  readonly entries: readonly T[];

  // every entry of the call, whatever the offset
  readonly total: number;
}

export interface RowState {
  readonly row: TopicRow;
  readonly isFolded: boolean;
  readonly isDropped: boolean;

  // the sub-topics that show their count and 3 items, by name
  readonly foldedSubs: readonly string[];
}
