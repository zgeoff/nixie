import { isMockItemShredded } from './is-mock-item-shredded';
import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';
import { toMockMemoryItem } from './to-mock-memory-item';

export function readMockMemoryItem(itemID: string) {
  const item = store.memoryItems.findFirst((query) => query.where({ itemID }));

  if (item === undefined) {
    return null;
  }

  const isGone = isMockItemShredded(item);

  return {
    ...toMockMemoryItem(item),
    versions: item.versions.map((version, index) => readMockVersion(version, index + 1, isGone)),
  };
}

type StoredVersion = StoredMemoryItem['versions'][number];

function readMockVersion(version: StoredVersion, number: number, isGone: boolean) {
  const isClosed = isGone || version.isUnreadable;

  return {
    change: version.change,
    checkerModel: version.checkerModel,
    checks: version.checks === null ? null : { ...version.checks },
    evidence: version.evidence === null ? null : readEvidence(version.evidence, isClosed),
    evidenceQuote: isClosed ? null : version.evidenceQuote,
    image: version.image === null ? null : { ...version.image },
    origin: version.origin,
    proposalID: version.proposalID,
    recordedAt: version.recordedAt,
    source: version.source,
    state: version.state,
    taskID: version.taskID,
    version: number,
    writerModel: version.writerModel,
    ...toVersionText(version, isGone),
  };
}

type StoredEvidence = NonNullable<StoredVersion['evidence']>;

function readEvidence(evidence: StoredEvidence, isClosed: boolean) {
  return {
    end: evidence.end,
    message: isClosed ? null : readMessage(evidence.sequence),
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

function toVersionText(version: StoredVersion, isGone: boolean) {
  if (isGone) {
    return { status: 'shredded' as const };
  }

  return version.isUnreadable
    ? { status: 'unreadable' as const }
    : { status: 'readable' as const, text: version.text };
}
