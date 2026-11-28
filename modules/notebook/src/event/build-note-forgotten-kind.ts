import type { EnvelopeRecord, Log } from '@heynixie/log';
import { erasureFinishedCodec, readRecords } from '@heynixie/log';
import type { EventKind, NotedEvent } from '@heynixie/sessions';
import { noteForgottenCodec } from '../record/note-forgotten-codec';

export interface NoteForgottenEvent {
  readonly shortID: string;
}

const defaultReadLimit = 1000;

// The notebook's one entry in the events block: a line for each finished note forget by the user,
// such as "Sam forgot note n4w8k2c6rd", with the owner's name or "the owner" when it is unset, as
// the session prompt says. A forget by the assistant adds no line.
export function buildNoteForgottenKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  readLimit = defaultReadLimit,
): EventKind<NoteForgottenEvent> {
  return {
    name: 'note_forgotten',
    read: async (range) => {
      const events: NotedEvent<NoteForgottenEvent>[] = [];
      let after = range.after;

      // pages past the assistant's forgets, so only the user's count against the limit
      while (events.length < readLimit) {
        const records = await readRecords(log, {
          afterSequence: after,
          beforeSequence: range.through + 1,
          kinds: [noteForgottenCodec.kind, erasureFinishedCodec.kind],
          limit: readLimit,
        });

        for (const entry of records) {
          const forgotten = pickForgottenNote(entry.record);

          if (forgotten?.by === 'user' && events.length < readLimit) {
            events.push({
              sequence: entry.record.sequence,
              at: entry.record.recordedAt.getTime(),
              detail: { shortID: forgotten.shortID },
            });
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
      `${settings.ownerName ?? 'the owner'} forgot note ${detail.shortID}`,
  };
}

// A finished erasure of a note, or the end record that an earlier release wrote for a forget.
function pickForgottenNote(
  record: EnvelopeRecord,
): { readonly shortID: string; readonly by: 'user' | 'assistant' } | null {
  if (record.kind === erasureFinishedCodec.kind) {
    const finished = erasureFinishedCodec.decode(record.payload);

    return finished.kind === 'note' && finished.shortID !== null && finished.by !== 'system'
      ? { shortID: finished.shortID, by: finished.by }
      : null;
  }

  return noteForgottenCodec.decode(record.payload);
}
