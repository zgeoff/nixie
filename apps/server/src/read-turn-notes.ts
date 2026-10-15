import { findMessageTimeZone } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { EventRegistry, TurnNote, TurnNoteRange } from '@heynixie/models';
import {
  formatMessageTime,
  readEventsBlock,
  readTurnNoteRange,
  renderSystemMessage,
} from '@heynixie/models';
import type { Clock } from '@heynixie/tasks';

export interface TurnNotesOptions {
  readonly log: Pick<Log, 'writer'>;
  readonly events: EventRegistry;

  // the clock the note's messages take their time from
  readonly clock: Pick<Clock, 'now'>;

  // the owner's name, or null for "the owner"
  readonly ownerName: string | null;

  // the zone events show in until one of the owner's messages carries a zone
  readonly defaultZone: string;
}

// Reads the note before the next turn, or over a span a new session's recent turns cover: the
// events block over one range, memory changes included, as a system message. Times show in the
// zone of the owner's newest message, as the time tool answers.
export async function readTurnNotes(
  options: TurnNotesOptions,
  span?: TurnNoteRange,
): Promise<TurnNote> {
  const range = await readNoteRange(options.log, span);

  const isReplay = span !== undefined;

  const messageZone = await findMessageTimeZone(options.log);

  const timeZone = messageZone ?? options.defaultZone;

  const events = await readEventsBlock(options.events, range, {
    ownerName: options.ownerName,
    timeZone,
    isReplay,
  });

  const now = new Date(options.clock.now());

  const at = formatMessageTime(now, timeZone, { defaultZone: options.defaultZone, now });

  return {
    text:
      events.text === null ? null : renderSystemMessage({ type: 'events', at, body: events.text }),
    throughSequence: range.through,
    eventCount: events.count,
  };
}

function readNoteRange(
  log: Pick<Log, 'writer'>,
  span: TurnNoteRange | undefined,
): Promise<TurnNoteRange> {
  return span === undefined ? readTurnNoteRange(log) : Promise.resolve(span);
}
