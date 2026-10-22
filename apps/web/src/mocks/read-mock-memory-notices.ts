import type { ContractOutputs } from '@heynixie/contract';
import { store } from './store';
import { toMockMemoryItem } from './to-mock-memory-item';

type MemoryNotice = ContractOutputs['memory']['listNotices']['notices'][number];

export function readMockMemoryNotices(thread: string): readonly MemoryNotice[] {
  const notices = store.memoryNotices.findMany((query) => query.where({ thread }));

  return notices.map((notice) => ({
    entries: notice.entries.map((entry) => readMockEntry(entry)),
    kind: notice.kind,
    messageSequence: notice.messageSequence,
    noticeKey: notice.noticeKey,
    proposed: notice.entries.filter((entry) => entry.change === 'proposed').length,
    remembered:
      notice.count ??
      notice.entries.filter((entry) => entry.change === 'created' || entry.change === 'edited')
        .length,
    retired: notice.entries.filter((entry) => entry.change === 'retired').length,
    sequence: notice.sequence ?? Math.max(0, ...notice.entries.map((entry) => entry.sequence)),
  }));
}

type StoredEntry = ReturnType<typeof store.memoryNotices.all>[number]['entries'][number];

function readMockEntry(entry: StoredEntry): MemoryNotice['entries'][number] {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID: entry.itemID }));
  const change = item?.versions.at(-1)?.change;
  const kept = JSON.stringify(['keep', entry.itemID, entry.version, undefined]);

  return {
    change: entry.change,
    isKept: store.memoryActions.findFirst((query) => query.where({ input: kept })) !== undefined,
    item: item === undefined || change === undefined ? null : { ...toMockMemoryItem(item), change },
    itemID: entry.itemID,
    proposalID: entry.proposalID,
    sequence: entry.sequence,
    version: entry.version,
  };
}
