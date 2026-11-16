import type { JSONObject } from '@heynixie/log';
import type { ToolOutcome } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import type { TopicCount } from '../index-block/collect-topic-counts';
import type { IndexLine } from '../index-block/collect-topic-lines';
import type { EntryPage } from '../index-block/types';
import { parseItemCursor } from '../item/parse-item-cursor';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import type { MemorySubject } from '../types';
import { buildHiddenUUIDs } from '../utils/build-hidden-uuids';

export interface TopicInput {
  readonly topic?: string | undefined;
  readonly topics?: true | undefined;
  readonly after?: string | undefined;
  readonly subjects?: readonly MemorySubject[] | undefined;
}

type TopicDependencies = Pick<StartedMemoryStore, 'readTopicLines' | 'readTopicCounts'>;

interface PageShape<T> {
  readonly key: 'lines' | 'topics';
  readonly toEntry: (entry: T) => JSONObject;

  // what the stored result keeps of the page's entries
  readonly toRecordEntries: (entries: readonly T[]) => JSONObject;
  readonly toUUIDs: (entry: T) => readonly (readonly [string, string])[];
}

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

    return buildOutcome(page, lineShape, { offset, searched });
  }

  const page = await memory.readTopicCounts({ ...subjects, offset });

  return buildOutcome(page, topicShape, { offset, searched });
}

function buildSearched(input: TopicInput): JSONObject {
  return {
    ...(input.topic === undefined ? {} : { topic: input.topic }),
    ...(input.topics === undefined ? {} : { topics: input.topics }),
    ...(input.subjects === undefined ? {} : { subjects: [...input.subjects] }),
  };
}

interface PageCall {
  readonly offset: number;
  readonly searched: JSONObject;
}

function buildOutcome<T>(page: EntryPage<T>, shape: PageShape<T>, call: PageCall): ToolOutcome {
  const kept = cutEntries(page.entries, shape, call.searched);
  const end = call.offset + kept.length;
  const next = end < page.total ? String(end) : null;

  const leftOut: JSONObject =
    end < page.total ? { leftOut: { count: page.total - end, itemIDs: [], versions: 0 } } : {};

  return {
    status: 'ok',
    result: {
      [shape.key]: kept.map((entry) => shape.toEntry(entry)),
      next,
      searched: call.searched,
      ...leftOut,
    },
    record: { ...shape.toRecordEntries(kept), next, ...leftOut },
    ...buildHiddenUUIDs(kept.flatMap((entry) => shape.toUUIDs(entry))),
  };
}

// The envelope is measured with `next` and `leftOut` at the most they can take. The page always
// keeps its first entry, so a call that continues from `next` makes progress.
function cutEntries<T>(
  entries: readonly T[],
  shape: PageShape<T>,
  searched: JSONObject,
): readonly T[] {
  const envelope = Buffer.byteLength(
    JSON.stringify({
      [shape.key]: [],
      next: '9'.repeat(20),
      searched,
      leftOut: { count: 999_999, itemIDs: [], versions: 0 },
    }),
  );

  let used = envelope;
  const kept: T[] = [];

  for (const entry of entries) {
    const bytes = Buffer.byteLength(JSON.stringify(shape.toEntry(entry))) + 1;

    if (kept.length > 0 && used + bytes > recallPageLimitBytes) {
      break;
    }

    used += bytes;

    kept.push(entry);
  }

  return kept;
}
