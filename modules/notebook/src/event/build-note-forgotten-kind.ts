import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { noteForgottenCodec } from '../record/note-forgotten-codec';

export interface NoteForgottenEvent {
  readonly shortID: string;
}

const readLimit = 1000;

// The notebook's one entry in the events block: a line for each finished note forget by the user,
// such as "Sam forgot note n4w8k2c6rd", with the owner's name or "the owner" when it is unset. A
// forget by the assistant adds no line.
export function buildNoteForgottenKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<NoteForgottenEvent> {
  return {
    name: 'note_forgotten',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: [noteForgottenCodec.kind],
        limit: readLimit,
      });

      return records.flatMap((entry) => {
        const forgotten = noteForgottenCodec.decode(entry.record.payload);

        return forgotten.by === 'user'
          ? [
              {
                sequence: entry.record.sequence,
                at: entry.record.recordedAt.getTime(),
                detail: { shortID: forgotten.shortID },
              },
            ]
          : [];
      });
    },
    render: (detail, settings) =>
      `${settings.ownerName ?? 'the owner'} forgot note ${detail.shortID}`,
  };
}
