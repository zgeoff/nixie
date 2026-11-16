import type { MemorySubject } from '../types';

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
