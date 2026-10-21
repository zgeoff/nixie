import { store } from './store';

interface VersionRef {
  readonly itemID: string;
  readonly version: number;
}

export function readMemoryVersion(ref: VersionRef) {
  const stored = store.memoryVersions.findFirst((query) =>
    query.where({ itemID: ref.itemID, version: ref.version }),
  );

  if (stored === undefined) {
    return { itemID: ref.itemID, status: 'missing' as const, version: ref.version };
  }

  return {
    itemID: stored.itemID,
    status: stored.status,
    ...(stored.status === 'readable' && stored.text !== undefined ? { text: stored.text } : {}),
    version: stored.version,
  };
}
