import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { z } from 'zod';

// A possible self-note the note-taker flagged, with the ID of your message it came from.
export interface SelfNoteFlagEvent {
  readonly text: string;
  readonly sourceSequence: number;
}

// The event kind for a possible self-note the note-taker flagged. The line tells the assistant the
// flag is a nudge and never a note, so the assistant writes the self-note in its own voice or lets
// it go. A flag whose text a forget erased lists nothing.
export function buildSelfNoteFlagKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<SelfNoteFlagEvent> {
  return {
    name: 'self_note_flag',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: ['memory.self_note_flagged'],
        limit: maxFlags,
      });

      return records.flatMap((entry) => {
        const record = entry.record;
        const erasable = record.erasable;
        const payload = flagPayload.safeParse(record.payload);
        const text = erasable.status === 'readable' ? erasable.fields['text'] : undefined;

        if (typeof text !== 'string' || !payload.success) {
          return [];
        }

        return [
          {
            sequence: record.sequence,
            at: record.recordedAt.getTime(),
            detail: {
              text: text.replaceAll(/\s+/gu, ' '),
              sourceSequence: payload.data.sourceSequence,
            },
          },
        ];
      });
    },
    render: (detail) =>
      `Your note-taker's nudge, not a note: possible self-note: "${detail.text}", event #${String(detail.sourceSequence)}. If it rings true, write the self-note yourself, in your own voice. If not, let it go.`,
  };
}

// the most flags one events block reads, which the block's own cap then trims
const maxFlags = 50;
const flagPayload = z.object({ sourceSequence: z.int() });
