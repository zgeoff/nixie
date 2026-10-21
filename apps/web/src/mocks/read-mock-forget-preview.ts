import { readMockMemoryItem } from './read-mock-memory-item';
import { store } from './store';

interface ForgetTarget {
  readonly itemID: string;
  readonly version: number;
}

export function readMockForgetPreview(target: ForgetTarget) {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID: target.itemID }));
  const detail = readMockMemoryItem(target.itemID);

  if (
    item === undefined ||
    detail === null ||
    item.state === 'forgetting' ||
    item.state === 'forgotten'
  ) {
    return { status: 'not_found' as const };
  }

  if (item.versions.length !== target.version) {
    return { status: 'stale' as const };
  }

  const sequences = new Set(item.versions.flatMap((version) => version.evidence?.sequence ?? []));

  const proposals = store.memoryProposals.findMany((query) =>
    query.where({ itemID: target.itemID }),
  );

  return {
    status: 'read' as const,
    preview: { ...detail, lost: { evidenceMessages: sequences.size, proposals: proposals.length } },
  };
}
