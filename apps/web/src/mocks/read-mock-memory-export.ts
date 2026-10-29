import { store } from './store';
import type { StoredMemoryItem } from './to-mock-memory-item';

export function readMockMemoryExport(exportedAt: Date): readonly string[] {
  const header = {
    schemaVersion: 6,
    exportedAt: exportedAt.toISOString(),
    snapshotHash: 'sha256:mock',
  };

  const items = store.memoryItems
    .all()
    .map((item, index) => `${index === 0 ? '\n' : ',\n'}${JSON.stringify(toExportItem(item))}`);

  const moments = store.moments
    .all()
    .map(
      (moment, index) => `${index === 0 ? '\n' : ',\n'}${JSON.stringify(toExportMoment(moment))}`,
    );

  return [
    `{"header":${JSON.stringify(header)},"items":[`,
    ...items,
    '\n],"moments":[',
    ...moments,
    '\n]}\n',
  ];
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
    isSensitive: item.isSensitive,
    subject: item.subject,
    versions: item.versions.map((version, index) => ({
      version: index + 1,
      change: version.change,
      state: version.state,
      text: version.isUnreadable ? null : version.text,
      evidenceQuote: version.isUnreadable ? null : version.evidenceQuote,
      until: null,
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

type StoredMoment = ReturnType<typeof store.moments.all>[number];

const textKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

function toExportMoment(moment: StoredMoment) {
  if (moment.state === 'destroyed') {
    return { momentID: moment.momentID, destroyedAt: null };
  }

  const records = store.records
    .findMany((query) =>
      query.where(
        (record) =>
          record.thread === moment.thread &&
          record.sequence >= moment.firstSequence &&
          record.sequence <= moment.lastSequence,
      ),
    )
    .toSorted((left, right) => left.sequence - right.sequence);

  return {
    momentID: moment.momentID,
    shortID: moment.shortID,
    state: moment.state,
    thread: moment.thread,
    firstSequence: moment.firstSequence,
    lastSequence: moment.lastSequence,
    keptBy: moment.keptBy,
    keptThread: null,
    keptModel: null,
    keptAt: moment.keptAt.toISOString(),
    editedAt: moment.editedAt?.toISOString() ?? null,
    title: moment.title,
    note: moment.note?.text ?? null,
    reflections: moment.reflections.map((reflection) => ({
      reflectionID: reflection.reflectionID,
      model: reflection.model,
      writtenAt: reflection.writtenAt.toISOString(),
      text: reflection.text,
    })),
    links: moment.linkedItemIDs,
    records: records.map((record) => ({
      sequence: record.sequence,
      kind: record.kind,
      recordedAt: record.recordedAt.toISOString(),
      source: record.kind === 'owner_message' ? 'owner' : 'nixie',
      payload: null,
      decision: null,
      text: record.message?.text ?? null,
      isGap: textKinds.has(record.kind) && record.message === undefined,
    })),
  };
}
