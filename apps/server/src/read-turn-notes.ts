import type { Clock } from '@heynixie/clock';
import { readMessageTimeZone } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { EventRegistry, TurnNote, TurnNoteRange, TurnNoteRequest } from '@heynixie/sessions';
import { formatMessageTime, readEventsBlock, readTurnNoteRange } from '@heynixie/sessions';
import { renderSystemMessage } from '@heynixie/wire';

export interface TurnNotesOptions {
  readonly log: Pick<Log, 'writer'>;
  readonly events: EventRegistry;

  readonly clock: Pick<Clock, 'now'>;

  readonly ownerName: string | null;

  readonly defaultZone: string;
}

export async function readTurnNotes(
  options: TurnNotesOptions,
  request: TurnNoteRequest = {},
): Promise<TurnNote> {
  const span = request.span;

  const range = await readNoteRange(options.log, span);

  const isReplay = span !== undefined;

  const messageZone = await readMessageTimeZone(options.log);

  const timeZone = messageZone ?? options.defaultZone;

  const events = await readEventsBlock(options.events, range, {
    ownerName: options.ownerName,
    timeZone,
    isReplay,
    isNewSession: request.isNewSession === true,
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
