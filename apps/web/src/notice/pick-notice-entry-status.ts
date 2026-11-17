import type { MemoryNoticeEntry } from '../types';

export type NoticeEntryStatus =
  | 'open'
  | 'kept'
  | 'undone'
  | 'retired'
  | 'changed'
  | 'proposed'
  | 'labelled'
  | 'pinned'
  | 'unpinned'
  | 'gone';

export function pickNoticeEntryStatus(entry: MemoryNoticeEntry): NoticeEntryStatus {
  if (entry.change === 'proposed') {
    return 'proposed';
  }

  const item = entry.item;

  if (item === null || item.state === 'forgetting' || item.state === 'forgotten') {
    return 'gone';
  }

  if (entry.change === 'labelled' || entry.change === 'pinned' || entry.change === 'unpinned') {
    return entry.change;
  }

  if (item.version === entry.version) {
    return entry.isKept ? 'kept' : 'open';
  }

  if (item.change === 'undone') {
    return 'undone';
  }

  return item.change === 'retired' ? 'retired' : 'changed';
}
