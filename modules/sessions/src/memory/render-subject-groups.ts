import type { MemoryItem, MemoryLineOptions } from '../types';
import { renderMemoryItem } from './render-memory-item';

export type SubjectItem = Omit<MemoryItem, 'model'> & Partial<Pick<MemoryItem, 'model'>>;

const subjectOrder = ['owner', 'shared', 'self'] as const;

const headings: Readonly<Record<MemoryItem['subject'], (owner: string) => string>> = {
  owner: (owner) => `About ${owner}:`,
  shared: (owner) => `Between you and ${owner}:`,
  self: () => 'About yourself, in your own words:',
};

export function renderSubjectHeading(
  subject: MemoryItem['subject'],
  ownerName: string | null,
): string {
  return headings[subject](ownerName ?? 'the owner');
}

export function renderSubjectGroups(
  items: readonly SubjectItem[],
  options: MemoryLineOptions,
): readonly string[] {
  const lines: string[] = [];

  for (const subject of subjectOrder) {
    const group = items.filter((item) => item.subject === subject);

    if (group.length > 0) {
      lines.push(
        renderSubjectHeading(subject, options.ownerName),
        ...group.flatMap((item) => renderMemoryItem(item, options)),
      );
    }
  }

  return lines;
}
