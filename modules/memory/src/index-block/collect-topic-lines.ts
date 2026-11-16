import type { MemorySubject } from '../types';
import { compareNewestFirst, subjectOrder } from './collect-topic-rows';
import { filterSubjectRows } from './filter-subject-rows';
import type { IndexRow } from './read-index-rows';

export interface IndexLine {
  readonly itemID: string;
  readonly gist: string;
  readonly subject: MemorySubject;

  // the item's UUID, which the model never reads
  readonly itemUUID: string;
}

// `people` matches `people` and every topic under it, and the match ignores case. Lines come in
// the order of the block: subject, then newest first.
export function collectTopicLines(
  rows: readonly IndexRow[],
  topic: string,
  subjects: readonly MemorySubject[] | undefined,
): readonly IndexLine[] {
  const wanted = topic.toLowerCase();

  return filterSubjectRows(rows, subjects)
    .filter((row) => {
      const held = row.topic.toLowerCase();

      return held === wanted || held.startsWith(`${wanted}/`);
    })
    .toSorted(
      (left, right) =>
        subjectOrder.indexOf(left.subject) - subjectOrder.indexOf(right.subject) ||
        compareNewestFirst(left, right),
    )
    .map((row) => ({
      itemID: row.shortID,
      gist: row.gist,
      subject: row.subject,
      itemUUID: row.itemID,
    }));
}
