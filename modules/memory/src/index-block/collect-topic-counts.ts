import type { MemorySubject } from '../types';
import { compareFolded, compareNewestFirst, subjectOrder } from './collect-topic-rows';
import { filterSubjectRows } from './filter-subject-rows';
import type { IndexRow } from './read-index-rows';

export interface TopicCount {
  readonly topic: string;
  readonly subject: MemorySubject;
  readonly items: number;
}

// One entry per topic as its items hold it, in the order of the block.
export function collectTopicCounts(
  rows: readonly IndexRow[],
  subjects: readonly MemorySubject[] | undefined,
): readonly TopicCount[] {
  const wanted = filterSubjectRows(rows, subjects);

  return subjectOrder.flatMap((subject) => {
    const newestFirst = wanted
      .filter((row) => row.subject === subject)
      .toSorted(compareNewestFirst);

    const groups = Map.groupBy(newestFirst, (row) => row.topic.toLowerCase());

    return [...groups.values()]
      .map((group) => ({ topic: group[0]?.topic ?? '', subject, items: group.length }))
      .toSorted((left, right) => compareFolded(left.topic, right.topic));
  });
}
