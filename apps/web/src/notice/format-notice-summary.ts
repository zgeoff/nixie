import type { MemoryNotice } from '../types';

export function formatNoticeSummary(
  notice: Pick<MemoryNotice, 'remembered' | 'retired' | 'proposed'> & {
    readonly entries: readonly Pick<MemoryNotice['entries'][number], 'change'>[];
  },
): string {
  const updated = notice.entries.filter((entry) => isUpdateChange(entry.change)).length;

  const parts = [
    formatCount('Remembered', notice.remembered),
    formatCount('Retired', notice.retired),
    formatCount('Proposed', notice.proposed),
    formatCount('Updated', updated),
  ].filter((part) => part !== null);

  return parts.join(', ');
}

function isUpdateChange(change: MemoryNotice['entries'][number]['change']): boolean {
  return change === 'labelled' || change === 'pinned' || change === 'unpinned';
}

function formatCount(verb: string, count: number): string | null {
  if (count === 0) {
    return null;
  }

  return `${verb} ${String(count)} ${count === 1 ? 'thing' : 'things'}`;
}
