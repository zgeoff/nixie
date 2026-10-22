import type { MemoryNotice } from './types';

export function formatNoticeSummary(
  notice: Pick<MemoryNotice, 'kind' | 'remembered' | 'retired' | 'proposed'>,
): string {
  const parts = [
    formatCount('Remembered', notice.remembered),
    formatCount('Retired', notice.retired),
    formatCount('Proposed', notice.proposed),
  ].filter((part) => part !== null);

  const summary = parts.join(', ');

  if (notice.kind === 'batch') {
    return `${summary} from earlier conversation`;
  }

  return summary;
}

function formatCount(verb: string, count: number): string | null {
  if (count === 0) {
    return null;
  }

  return `${verb} ${String(count)} ${count === 1 ? 'thing' : 'things'}`;
}
