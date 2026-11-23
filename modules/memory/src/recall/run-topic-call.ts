import type { JSONObject } from '@heynixie/log';
import type { ToolOutcome } from '@heynixie/tools';
import type { TopicCount } from '../index-block/collect-topic-counts';
import type { IndexLine } from '../index-block/collect-topic-lines';
import { parseItemCursor } from '../item/parse-item-cursor';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import type { MemorySubject } from '../types';
import { buildPageOutcome } from './build-page-outcome';
import type { PageShape } from './build-page-outcome';

export interface TopicInput {
  readonly topic?: string | undefined;
  readonly topics?: true | undefined;
  readonly after?: string | undefined;
  readonly subjects?: readonly MemorySubject[] | undefined;
}

type TopicDependencies = Pick<StartedMemoryStore, 'readTopicLines' | 'readTopicCounts'>;

const lineShape: PageShape<IndexLine> = {
  key: 'lines',
  toEntry: (line) => ({ itemID: line.itemID, gist: line.gist, subject: line.subject }),
  toRecordEntries: (lines) => ({ lines: lines.map((line) => ({ itemID: line.itemID })) }),
  toUUIDs: (line) => [[line.itemID, line.itemUUID]],
};

const topicShape: PageShape<TopicCount> = {
  key: 'topics',
  toEntry: (count) => ({ topic: count.topic, subject: count.subject, items: count.items }),
  toRecordEntries: () => ({}),
  toUUIDs: () => [],
};

// A topic page and a topic list read the in-memory label entries only, so they write no recall
// record, and the result is cut to the page limit here.
export async function runTopicCall(
  memory: TopicDependencies,
  input: TopicInput,
): Promise<ToolOutcome> {
  const offset = parseItemCursor(input.after);
  const subjects = input.subjects === undefined ? {} : { subjects: input.subjects };
  const searched = buildSearched(input);

  if (input.topic !== undefined) {
    const page = await memory.readTopicLines({ ...subjects, topic: input.topic, offset });

    return buildPageOutcome(page, lineShape, { offset, searched });
  }

  const page = await memory.readTopicCounts({ ...subjects, offset });

  return buildPageOutcome(page, topicShape, { offset, searched });
}

function buildSearched(input: TopicInput): JSONObject {
  return {
    ...(input.topic === undefined ? {} : { topic: input.topic }),
    ...(input.topics === undefined ? {} : { topics: input.topics }),
    ...(input.subjects === undefined ? {} : { subjects: [...input.subjects] }),
  };
}
