import { store } from './store';

const textKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

// The mock reads a whole span as one page, and shows a message whose text a forget removed as a gap.
export function readMockMomentSpan(momentID: string) {
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
          record.sequence <= moment.lastSequence,
      ),
    )
    .toSorted((left, right) => left.sequence - right.sequence);

  return {
    records: records.map((record) => ({
      isGap: textKinds.has(record.kind) && record.message === undefined,
      kind: record.kind,
      recordedAt: record.recordedAt,
      sequence: record.sequence,
      text: record.message?.text ?? null,
      tool: record.kind === 'tool_called' ? (record.toolCall?.tool ?? null) : null,
    })),
    next: null,
  };
}
