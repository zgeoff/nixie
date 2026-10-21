import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';

export function readMockMemoryExport(exportedAt: Date): readonly string[] {
  const header = {
    schemaVersion: 3,
    exportedAt: exportedAt.toISOString(),
    snapshotHash: 'sha256:mock',
  };

  const items = store.memoryItems
    .all()
    .map((item, index) => `${index === 0 ? '\n' : ',\n'}${JSON.stringify(toExportItem(item))}`);

  return [`{"header":${JSON.stringify(header)},"items":[`, ...items, '\n]}\n'];
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
    subject: item.subject,
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
