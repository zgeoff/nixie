import type { EnvelopeRecord, ErasableKind, Log, RecordKind } from '@heynixie/log';
import { erasureFinishedCodec, readErasureParentIDs, readRecords } from '@heynixie/log';
import type { EventKind, NotedEvent } from '@heynixie/sessions';

export type ForgottenKind = 'memory' | 'moment' | 'message';

export type ForgottenNotices = Readonly<Record<ForgottenKind, boolean>>;

export interface ForgottenEvent {
  readonly kind: ForgottenKind;

  // the ID the model sees: an item's or a moment's short ID, or a message's record sequence
  readonly id: string;
}

const defaultPageSize = 1000;

// A forget that another forget began, such as the messages of a forgotten image or of a reset,
// adds no line, and neither does a forget of a record that is no message, such as a tool result.
export function buildForgottenKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  notices: ForgottenNotices,
  pageSize = defaultPageSize,
): EventKind<ForgottenEvent> {
  return {
    name: 'forgotten',
    read: async (range) => {
      const events: NotedEvent<ForgottenEvent>[] = [];
      let after = range.after;

      // every forget through the range, a page at a time, so the block counts those it hides
      for (;;) {
        const records = await readRecords(log, {
          afterSequence: after,
          beforeSequence: range.through + 1,
          kinds: [erasureFinishedCodec.kind],
          limit: pageSize,
        });

        const finished = records
          .map((entry) => pickFinished(entry.record, notices))
          .filter((found) => found !== null);

        const [parents, messageIDs] = await Promise.all([
          readErasureParentIDs(
            log,
            finished.map((found) => found.erasureID),
          ),
          readMessageIDs(log, finished),
        ]);

        for (const found of finished) {
          const isMessage = found.event.kind === 'message';

          const isListed =
            parents.get(found.erasureID) === null && (!isMessage || messageIDs.has(found.event.id));

          if (isListed) {
            events.push({ sequence: found.sequence, at: found.at, detail: found.event });
          }
        }

        const last = records.at(-1);

        if (last === undefined || records.length < pageSize) {
          return events;
        }

        after = last.record.sequence;
      }
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

// the records that a message forget reaches, as the API's contract names them
const messageRecordKinds: readonly RecordKind[] = ['owner_message', 'model.reply'];

// The IDs among those that a message forget names whose record is a message.
async function readMessageIDs(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  finished: readonly Finished[],
): Promise<ReadonlySet<string>> {
  const sequences = finished.flatMap((found) =>
    found.event.kind === 'message' ? [Number(found.event.id)] : [],
  );

  if (sequences.length === 0) {
    return new Set();
  }

  const records = await readRecords(log, {
    afterSequence: 0,
    sequences,
    kinds: messageRecordKinds,
    limit: sequences.length,
  });

  return new Set(records.map((entry) => String(entry.record.sequence)));
}
