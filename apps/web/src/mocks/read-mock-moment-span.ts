import { store } from './store';

const textKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

const pageSize = 100;

// The mock shows a message with no text as a gap, and marks it removed when a forget removed it.
export function readMockMomentSpan(momentID: string, after?: number) {
  const moment = store.moments.findFirst((query) =>
    query.where((candidate) => candidate.momentID === momentID || candidate.shortID === momentID),
  );

  if (moment === undefined || moment.state === 'destroyed') {
    return null;
  }

  const records = store.records
    .findMany((query) =>
      query.where(
        (record) =>
          record.thread === moment.thread &&
          record.sequence >= moment.firstSequence &&
          record.sequence <= moment.lastSequence &&
          record.sequence > (after ?? -1),
      ),
    )
    .toSorted((left, right) => left.sequence - right.sequence);

  const page = records.slice(0, pageSize);
  const last = page.at(-1);

  return {
    records: page.map((record) => ({
      isGap: textKinds.has(record.kind) && record.message === undefined,
      isRemoved: record.isRemoved === true,
      kind: record.kind,
      recordedAt: record.recordedAt,
      sequence: record.sequence,
      text: record.message?.text ?? null,
      tool: record.kind === 'tool_called' ? (record.toolCall?.tool ?? null) : null,
    })),
    next: records.length > pageSize && last !== undefined ? last.sequence : null,
  };
}
