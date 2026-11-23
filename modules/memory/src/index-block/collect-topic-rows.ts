import type { MemorySubject } from '../types';
import type { IndexRow } from './read-index-rows';

export interface TopicLine {
  readonly shortID: string;
  readonly gist: string;
}

export type FoldOrder = 'newest' | 'oldest';

// The order a topic's folded rows show their items in, for the topic's row and each sub-topic under
// it. A topic with no entry folds newest first.
export interface TopicFoldOrder {
  readonly subject: MemorySubject;
  readonly topic: string;
  readonly order: FoldOrder;
}

export interface SubTopic {
  readonly name: string;
  readonly count: number;

  // newest first
  readonly lines: readonly TopicLine[];
}

export interface TopicRow {
  readonly subject: MemorySubject;
  readonly name: string;
  readonly count: number;
  readonly foldOrder: FoldOrder;

  // newest first
  readonly lines: readonly TopicLine[];

  // the items filed under the topic itself, newest first
  readonly directLines: readonly TopicLine[];
  readonly subTopics: readonly SubTopic[];
}

export const subjectOrder: readonly MemorySubject[] = ['owner', 'shared', 'self'];

export function compareNewestFirst(left: IndexRow, right: IndexRow): number {
  return right.createdSequence - left.createdSequence;
}

export function compareFolded(left: string, right: string): number {
  const foldedLeft = left.toLowerCase();
  const foldedRight = right.toLowerCase();

  if (foldedLeft === foldedRight) {
    return 0;
  }

  return foldedLeft < foldedRight ? -1 : 1;
}

// A topic belongs to one subject, so the rows of 2 subjects never merge.
export function collectTopicRows(
  rows: readonly IndexRow[],
  foldOrders: readonly TopicFoldOrder[] = [],
): readonly TopicRow[] {
  return subjectOrder.flatMap((subject) => {
    const newestFirst = rows.filter((row) => row.subject === subject).toSorted(compareNewestFirst);
    const groups = Map.groupBy(newestFirst, (row) => splitTopic(row.topic).root.toLowerCase());

    return [...groups.values()]
      .map((group) => buildTopicRow(subject, group, foldOrders))
      .toSorted((left, right) => compareFolded(left.name, right.name));
  });
}

// A sub-topic is everything after the first slash.
function splitTopic(topic: string): { readonly root: string; readonly sub: string | null } {
  const slash = topic.indexOf('/');

  return slash === -1
    ? { root: topic, sub: null }
    : { root: topic.slice(0, slash), sub: topic.slice(slash + 1) };
}

function buildTopicRow(
  subject: MemorySubject,
  group: readonly IndexRow[],
  foldOrders: readonly TopicFoldOrder[],
): TopicRow {
  const [newest] = group;
  const name = newest === undefined ? '' : splitTopic(newest.topic).root;

  const subs = Map.groupBy(
    group.filter((row) => splitTopic(row.topic).sub !== null),
    (row) => (splitTopic(row.topic).sub ?? '').toLowerCase(),
  );

  const order = foldOrders.find(
    (entry) => entry.subject === subject && entry.topic.toLowerCase() === name.toLowerCase(),
  );

  return {
    subject,
    name,
    count: group.length,
    foldOrder: order?.order ?? 'newest',
    lines: group.map((row) => toTopicLine(row)),
    directLines: group
      .filter((row) => splitTopic(row.topic).sub === null)
      .map((row) => toTopicLine(row)),
    subTopics: [...subs.values()]
      .map((rowsOfSub) => ({
        name: splitTopic(rowsOfSub[0]?.topic ?? '').sub ?? '',
        count: rowsOfSub.length,
        lines: rowsOfSub.map((row) => toTopicLine(row)),
      }))
      .toSorted((left, right) => compareFolded(left.name, right.name)),
  };
}

function toTopicLine(row: IndexRow): TopicLine {
  return { shortID: row.shortID, gist: row.gist };
}
