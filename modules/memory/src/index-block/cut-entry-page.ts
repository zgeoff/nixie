import type { StoreParts } from '../types';
import { getIndexSettings } from './read-index';
import type { EntryPage } from './types';

export function cutEntryPage<T>(
  parts: Pick<StoreParts, 'context'>,
  all: readonly T[],
  offset: number,
): EntryPage<T> {
  return {
    entries: all.slice(offset, offset + getIndexSettings(parts).topicPage),
    total: all.length,
  };
}
