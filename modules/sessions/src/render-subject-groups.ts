import { renderMemoryItem } from './render-memory-item';
import type { MemoryItem, MemoryLineOptions } from './types';

// A memory item as its line renders it, which needs no model, so the pinned core's count can
// render an item before its version is written.
export type SubjectItem = Omit<MemoryItem, 'model'> & Partial<Pick<MemoryItem, 'model'>>;

// Renders memory items under a heading for each subject, in the order owner, shared, self, and
// leaves out a subject with no item. Each group keeps its items' order, so the pinned core stays in
// pin order within a subject and retrieval in rank order.
export function renderSubjectGroups(
  items: readonly SubjectItem[],
  options: MemoryLineOptions,
): readonly string[] {
  const owner = options.ownerName ?? 'the owner';
  const lines: string[] = [];

  for (const subject of subjectOrder) {
    const group = items.filter((item) => item.subject === subject);

    if (group.length > 0) {
      lines.push(
        headings[subject](owner),
        ...group.flatMap((item) => renderMemoryItem(item, options)),
      );
    }
  }

  return lines;
}

const subjectOrder = ['owner', 'shared', 'self'] as const;

const headings: Readonly<Record<MemoryItem['subject'], (owner: string) => string>> = {
  owner: (owner) => `About ${owner}:`,
  shared: (owner) => `Between you and ${owner}:`,
  self: () => 'About yourself, in your own words:',
};
