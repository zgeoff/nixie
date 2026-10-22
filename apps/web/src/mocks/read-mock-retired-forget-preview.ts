import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';
import { toMockMemoryItem } from './to-mock-memory-item';

const previewLimit = 100;

export function readMockRetiredForgetPreview() {
  const retired = store.memoryItems.all().filter((item) => item.state === 'retired');

  return {
    hasMore: retired.length > previewLimit,
    items: retired.slice(0, previewLimit).map((item) => readPreviewItem(item)),
  };
}

function readPreviewItem(item: StoredMemoryItem) {
  const sequences = new Set(item.versions.flatMap((version) => version.evidence?.sequence ?? []));

  const proposals = store.memoryProposals.findMany((query) => query.where({ itemID: item.itemID }));

  return {
    ...toMockMemoryItem(item),
    lost: { evidenceMessages: sequences.size, proposals: proposals.length },
  };
}
