import type { StoreParts } from '../types';
import { collectTopicCounts } from './collect-topic-counts';
import type { TopicCount } from './collect-topic-counts';
import { cutEntryPage } from './cut-entry-page';
import { readIndexRows } from './read-index-rows';
import type { EntryPage, TopicRequest } from './types';

export function readTopicCounts(
  parts: StoreParts,
  request: TopicRequest,
): Promise<EntryPage<TopicCount>> {
  return parts.lock(async () => {
    const rows = await readIndexRows(parts, { isPinnedIncluded: false });

    return cutEntryPage(parts, collectTopicCounts(rows, request.subjects), request.offset);
  });
}
