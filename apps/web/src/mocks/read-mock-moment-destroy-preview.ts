import { readMockMoment } from './read-mock-moment';
import { store } from './store';

interface MomentTarget {
  readonly momentID: string;
  readonly version: number;
}

export function readMockMomentDestroyPreview(target: MomentTarget) {
  const moment = readMockMoment(target.momentID);

  if (moment === null) {
    return { status: 'not_found' as const };
  }

  if (moment.version !== target.version) {
    return { status: 'stale' as const };
  }

  const records = store.records.findMany((query) =>
    query.where(
      (record) =>
        record.thread === moment.thread &&
        record.sequence >= moment.firstSequence &&
        record.sequence <= moment.lastSequence,
    ),
  );

  return {
    status: 'read' as const,
    preview: {
      keptAt: moment.keptAt,
      keptBy: moment.keptBy,
      kept: { records: records.length },
      lost: {
        links: moment.links.length,
        texts: 1 + (moment.note === null ? 0 : 1) + moment.reflections.length,
      },
      momentID: moment.momentID,
      note: moment.note?.text ?? null,
      reflections: moment.reflections.map((reflection) => ({
        model: reflection.model,
        text: reflection.text,
        writtenAt: reflection.writtenAt,
      })),
      shortID: moment.shortID,
      state: moment.state,
      thread: moment.thread,
      title: moment.title,
      version: moment.version,
    },
  };
}
