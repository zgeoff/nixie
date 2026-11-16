import type { MemorySubject } from '../types';
import type { IndexRow } from './read-index-rows';

export interface TopicLine {
  readonly shortID: string;
  readonly gist: string;
}

export interface SubTopic {
  readonly name: string;
  readonly count: number;
}

export interface TopicRow {
  readonly subject: MemorySubject;
  readonly name: string;
  readonly count: number;

  // newest first
  readonly lines: readonly TopicLine[];
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
export function collectTopicRows(rows: readonly IndexRow[]): readonly TopicRow[] {
  return subjectOrder.flatMap((subject) => {
    const newestFirst = rows.filter((row) => row.subject === subject).toSorted(compareNewestFirst);
    const groups = Map.groupBy(newestFirst, (row) => splitTopic(row.topic).root.toLowerCase());

    return [...groups.values()]
      .map((group) => buildTopicRow(subject, group))
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

function buildTopicRow(subject: MemorySubject, group: readonly IndexRow[]): TopicRow {
  const [newest] = group;

  const subs = Map.groupBy(
    group.flatMap((row) => {
      const split = splitTopic(row.topic);

      return split.sub === null ? [] : [split.sub];
    }),
    (sub) => sub.toLowerCase(),
  );

  return {
    subject,
    name: newest === undefined ? '' : splitTopic(newest.topic).root,
    count: group.length,
    lines: group.map((row) => ({ shortID: row.shortID, gist: row.gist })),
    subTopics: [...subs.values()]
      .map((spellings) => ({ name: spellings[0] ?? '', count: spellings.length }))
      .toSorted((left, right) => compareFolded(left.name, right.name)),
  };
}
