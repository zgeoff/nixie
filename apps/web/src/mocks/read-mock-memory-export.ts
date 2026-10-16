import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';

// Reads the mock store into an export file as nixie's memory store streams it, in schema version
// 1: the header, then each item in the order the store created it, one chunk per item. A forgotten
// item, and a forgetting one, is only its ID and the time its forget completed.
export async function* readMockMemoryExport(exportedAt: Date): AsyncGenerator<string> {
  const header = {
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    snapshotHash: 'sha256:mock',
  };

  yield `{"header":${JSON.stringify(header)},"items":[`;
  let separator = '\n';

  for (const item of store.memoryItems.all()) {
    yield `${separator}${JSON.stringify(toExportItem(item))}`;
    separator = ',\n';
  }

  yield '\n]}\n';
}

function toExportItem(item: StoredMemoryItem) {
  if (item.state === 'forgetting' || item.state === 'forgotten') {
    return { itemID: item.itemID, forgottenAt: item.forgottenAt?.toISOString() ?? null };
  }

  return {
    itemID: item.itemID,
    shortID: item.shortID,
    state: item.state,
    isPinned: item.isPinned,
    versions: item.versions.map((version, index) => ({
      version: index + 1,
      change: version.change,
      state: version.state,
      text: version.isUnreadable ? null : version.text,
      evidenceQuote: version.isUnreadable ? null : version.evidenceQuote,
      provenance: {
        origin: version.origin,
        source: version.source,
        taskID: version.taskID,
        proposalID: version.proposalID,
        checks: version.checks,
        writerModel: version.writerModel,
        checkerModel: version.checkerModel,
        snapshotHash: 'sha256:mock',
        recordedAt: version.recordedAt.toISOString(),
      },
    })),
  };
}
