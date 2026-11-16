import type { StoreParts } from '../types';
import { collectTopicLines } from './collect-topic-lines';
import type { IndexLine } from './collect-topic-lines';
import { cutEntryPage } from './cut-entry-page';
import { readIndexRows } from './read-index-rows';
import type { EntryPage, TopicRequest } from './types';

export function readTopicLines(
  parts: StoreParts,
  request: TopicRequest & { readonly topic: string },
): Promise<EntryPage<IndexLine>> {
  return parts.lock(async () => {
    const rows = await readIndexRows(parts);

    return cutEntryPage(
      parts,
      collectTopicLines(rows, request.topic, request.subjects),
      request.offset,
    );
  });
}
