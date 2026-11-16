import type { ContentSource } from '@heynixie/log';
import type { MemoryApproval, MemoryItem, MemoryLineOptions, MemoryOrigin } from '../types';
import { formatMemoryDay } from '../utils/format-memory-day';

export interface NextVersion {
  readonly ref: string;
  readonly isRetirement: boolean;
}

const notedWords: Readonly<Record<MemoryOrigin, string | null>> = {
  conversation: 'you noted it',
  task: 'a task noted it',
  owner: null,
  lapse: 'its end time passed',
};

export function renderMemoryLine(
  version: Pick<
    MemoryItem,
    'shortID' | 'recordedAt' | 'origin' | 'source' | 'approval' | 'isBridge'
  > & {
    // the number the line shows: an item's revision, or a past version's text version
    readonly shownVersion: number;
  },
  options: MemoryLineOptions,
  next: NextVersion | null = null,
): string {
  const owner = options.ownerName ?? 'the owner';

  if (version.isBridge === true) {
    return [
      `${version.shortID} v${version.shownVersion}`,
      formatMemoryDay(version.recordedAt, options),
      'kept when a message it quoted was removed',
      next === null ? null : formatNext(next),
    ]
      .filter((part) => part !== null)
      .join(' · ');
  }

  const parts = [
    `${version.shortID} v${version.shownVersion}`,
    formatMemoryDay(version.recordedAt, options),
    notedWords[version.origin],
    formatBacking(version.source, version.approval, owner),
    version.approval === null ? null : `${owner} approved`,
    next === null ? null : formatNext(next),
  ];

  return parts.filter((part) => part !== null).join(' · ');
}

function formatNext(next: NextVersion): string {
  return next.isRetirement ? `retired in ${next.ref}` : `replaced by ${next.ref}`;
}

function formatBacking(
  source: ContentSource,
  approval: MemoryApproval | null,
  owner: string,
): string {
  if (source === 'owner') {
    return `${owner} said this`;
  }

  if (source === 'owner_data') {
    return `from ${owner}'s data`;
  }

  return approval?.isQuotePasted === true ? 'from a pasted page' : 'unconfirmed';
}
