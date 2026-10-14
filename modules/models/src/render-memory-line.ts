import type { ContentSource } from '@heynixie/log';
import { formatMemoryDay } from './format-memory-day';
import type { MemoryApproval, MemoryItem, MemoryLineOptions, MemoryOrigin } from './types';

// Renders the line under a memory that says where it came from in plain words, as in
// b7kq2m9xza v3 · 13 Oct · the note-taker noted it · from a pasted page · Sam approved. A past
// version's line ends with the version that replaced it.
export function renderMemoryLine(
  version: Pick<
    MemoryItem,
    'shortID' | 'version' | 'recordedAt' | 'origin' | 'source' | 'approval'
  >,
  options: MemoryLineOptions,
  replacedBy: string | null = null,
): string {
  const owner = options.ownerName ?? 'the owner';
  const parts = [
    `${version.shortID} v${version.version}`,
    formatMemoryDay(version.recordedAt, options),
    notedWords[version.origin],
    formatBacking(version.source, version.approval, owner),
    version.approval === null ? null : `${owner} approved`,
    replacedBy === null ? null : `replaced by ${replacedBy}`,
  ];

  return parts.filter((part) => part !== null).join(' · ');
}

// who noted a memory: the conversation is the model itself, and a version the owner saved names no
// one here, because what backs it already names them
const notedWords: Readonly<Record<MemoryOrigin, string | null>> = {
  conversation: 'you noted it',
  memory_writer: 'the note-taker noted it',
  task: 'a task noted it',
  owner: null,
};

// What backs a memory. Outside content always says so, and reads as unconfirmed unless its quote
// came from a pasted page, because the store keeps nothing that tells the model's own note from a
// web page it read.
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
