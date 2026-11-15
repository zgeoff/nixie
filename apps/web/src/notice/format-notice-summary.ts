import type { MemoryNotice } from '../types';

export function formatNoticeSummary(
  notice: Pick<MemoryNotice, 'remembered' | 'retired' | 'proposed'>,
): string {
  const parts = [
    formatCount('Remembered', notice.remembered),
    formatCount('Retired', notice.retired),
    formatCount('Proposed', notice.proposed),
  ].filter((part) => part !== null);

  return parts.join(', ');
}

function formatCount(verb: string, count: number): string | null {
  if (count === 0) {
    return null;
  }

  return `${verb} ${String(count)} ${count === 1 ? 'thing' : 'things'}`;
}
