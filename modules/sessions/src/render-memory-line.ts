import type { ContentSource } from '@heynixie/log';
import { formatMemoryDay } from './format-memory-day';
import type { MemoryApproval, MemoryItem, MemoryLineOptions, MemoryOrigin } from './types';

export interface NextVersion {
  readonly ref: string;
  readonly isRetirement: boolean;
}

const notedWords: Readonly<Record<MemoryOrigin, string | null>> = {
  conversation: 'you noted it',
  memory_writer: 'the note-taker noted it',
  task: 'a task noted it',
  owner: null,
};

export function renderMemoryLine(
  version: Pick<
    MemoryItem,
    'shortID' | 'version' | 'recordedAt' | 'origin' | 'source' | 'approval'
  >,
  options: MemoryLineOptions,
  next: NextVersion | null = null,
): string {
  const owner = options.ownerName ?? 'the owner';

  const parts = [
    `${version.shortID} v${version.version}`,
    formatMemoryDay(version.recordedAt, options),
    notedWords[version.origin],
    formatBacking(version.source, version.approval, owner),
    version.approval === null ? null : `${owner} approved`,
    next === null ? null : formatNext(next),
  ];

  return parts.filter((part) => part !== null).join(' · ');
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

function formatNext(next: NextVersion): string {
  return next.isRetirement ? `retired in ${next.ref}` : `replaced by ${next.ref}`;
}
