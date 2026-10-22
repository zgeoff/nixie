import type { MemoryNoticeEntry } from './types';

export type NoticeEntryStatus =
  | 'open'
  | 'kept'
  | 'undone'
  | 'retired'
  | 'changed'
  | 'proposed'
  | 'gone';

export function pickNoticeEntryStatus(entry: MemoryNoticeEntry): NoticeEntryStatus {
  if (entry.change === 'proposed') {
    return 'proposed';
  }

  const item = entry.item;

  if (item === null || item.state === 'forgetting' || item.state === 'forgotten') {
    return 'gone';
  }

  if (item.version === entry.version) {
    return entry.isKept ? 'kept' : 'open';
  }

  if (item.change === 'undone') {
    return 'undone';
  }

  return item.change === 'retired' ? 'retired' : 'changed';
}
