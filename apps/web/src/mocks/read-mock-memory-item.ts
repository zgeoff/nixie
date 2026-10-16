import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';
import { toMockMemoryItem } from './to-mock-memory-item';

// Reads one item with every version as nixie's API does, each version's quote with the message it
// points into. A forgotten item's versions read as gaps that show no message, and a message the
// store keeps without its text reads as forgotten. Null when no item has the ID.
export function readMockMemoryItem(itemID: string) {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));

  if (item === undefined) {
    return null;
  }

  const isGone = item.state === 'forgetting' || item.state === 'forgotten';

  return {
    ...toMockMemoryItem(item),
    versions: item.versions.map((version, index) => toMockVersion(version, index + 1, isGone)),
  };
}

type StoredVersion = StoredMemoryItem['versions'][number];

// one version as nixie's API reads it, as a gap once a forget began
function toMockVersion(version: StoredVersion, number: number, isGone: boolean) {
  return {
    change: version.change,
    checkerModel: version.checkerModel,
    checks: version.checks === null ? null : { ...version.checks },
    evidence: version.evidence === null ? null : readEvidence(version.evidence, isGone),
    evidenceQuote: isGone ? null : version.evidenceQuote,
    origin: version.origin,
    proposalID: version.proposalID,
    recordedAt: version.recordedAt,
    source: version.source,
    state: version.state,
    taskID: version.taskID,
    version: number,
    writerModel: version.writerModel,
    ...(isGone
      ? { status: 'shredded' as const }
      : { status: 'readable' as const, text: version.text }),
  };
}

type StoredEvidence = NonNullable<StoredVersion['evidence']>;

function readEvidence(evidence: StoredEvidence, isGone: boolean) {
  return {
    end: evidence.end,
    message: isGone ? null : readMessage(evidence.sequence),
    sequence: evidence.sequence,
    start: evidence.start,
  };
}

function readMessage(sequence: number) {
  const record = store.records.findFirst((query) => query.where({ sequence }));

  if (record === undefined) {
    return { status: 'missing' as const };
  }

  return record.message === undefined
    ? { status: 'shredded' as const }
    : { status: 'readable' as const, text: record.message.text };
}
