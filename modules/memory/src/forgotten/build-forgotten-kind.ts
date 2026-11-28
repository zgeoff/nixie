import type { EnvelopeRecord, ErasableKind, Log } from '@heynixie/log';
import { erasureFinishedCodec, readErasureParentIDs, readRecords } from '@heynixie/log';
import type { EventKind, NotedEvent } from '@heynixie/sessions';

export type ForgottenKind = 'memory' | 'moment' | 'message';

export type ForgottenNotices = Readonly<Record<ForgottenKind, boolean>>;

export interface ForgottenEvent {
  readonly kind: ForgottenKind;

  // the ID the model sees: an item's or a moment's short ID, or a message's record sequence
  readonly id: string;
}

const defaultReadLimit = 1000;

// A forget that another forget began, such as the messages of a forgotten image or of a reset,
// adds no line.
export function buildForgottenKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  notices: ForgottenNotices,
  readLimit = defaultReadLimit,
): EventKind<ForgottenEvent> {
  return {
    name: 'forgotten',
    read: async (range) => {
      const events: NotedEvent<ForgottenEvent>[] = [];
      let after = range.after;

      // pages past the forgets that add no line, so only the lines count against the limit
      while (events.length < readLimit) {
        const records = await readRecords(log, {
          afterSequence: after,
          beforeSequence: range.through + 1,
          kinds: [erasureFinishedCodec.kind],
          limit: readLimit,
        });

        const finished = records
          .map((entry) => pickFinished(entry.record, notices))
          .filter((found) => found !== null);

        const parents = await readErasureParentIDs(
          log,
          finished.map((found) => found.erasureID),
        );

        for (const found of finished) {
          if (parents.get(found.erasureID) === null && events.length < readLimit) {
            events.push({ sequence: found.sequence, at: found.at, detail: found.event });
          }
        }

        const last = records.at(-1);

        if (last === undefined || records.length < readLimit) {
          break;
        }

        after = last.record.sequence;
      }

      return events;
    },
    render: (detail, settings) =>
      `${settings.ownerName ?? 'the owner'} forgot ${detail.kind} ${detail.id}`,
  };
}

const forgottenKinds: Readonly<Partial<Record<ErasableKind, ForgottenKind>>> = {
  memory_item: 'memory',
  moment: 'moment',
  record: 'message',
};

interface Finished {
  readonly sequence: number;
  readonly at: number;
  readonly erasureID: string;
  readonly event: ForgottenEvent;
}

function pickFinished(record: EnvelopeRecord, notices: ForgottenNotices): Finished | null {
  const finished = erasureFinishedCodec.decode(record.payload);
  const kind = forgottenKinds[finished.kind];

  if (kind === undefined || !notices[kind] || finished.by !== 'user') {
    return null;
  }

  const id = kind === 'message' ? finished.targetID : finished.shortID;

  return id === null
    ? null
    : {
        sequence: record.sequence,
        at: record.recordedAt.getTime(),
        erasureID: finished.erasureID,
        event: { kind, id },
      };
}
