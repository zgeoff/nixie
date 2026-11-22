import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { noteForgottenCodec } from '../record/note-forgotten-codec';

export interface NoteForgottenEvent {
  readonly shortID: string;
}

const readLimit = 1000;

// The notebook's one entry in the events block: a line for each finished note forget, at the time
// of notebook.note_forgotten, such as "Sam forgot note n4w8k2c6rd". The name is the owner's, or
// "the owner" when it is unset, as in the session prompt.
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

      return records.map((entry) => ({
        sequence: entry.record.sequence,
        at: entry.record.recordedAt.getTime(),
        detail: { shortID: noteForgottenCodec.decode(entry.record.payload).shortID },
      }));
    },
    render: (detail, settings) =>
      `${settings.ownerName ?? 'the owner'} forgot note ${detail.shortID}`,
  };
}
