import { renderMemoryItem } from './render-memory-item';
import type { MemoryItem, MemoryLineOptions } from './types';

export type SubjectItem = Omit<MemoryItem, 'model'> & Partial<Pick<MemoryItem, 'model'>>;

const subjectOrder = ['owner', 'shared', 'self'] as const;

const headings: Readonly<Record<MemoryItem['subject'], (owner: string) => string>> = {
  owner: (owner) => `About ${owner}:`,
  shared: (owner) => `Between you and ${owner}:`,
  self: () => 'About yourself, in your own words:',
};

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
