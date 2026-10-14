import { findMessageTimeZone } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { MemoryStore } from '@heynixie/memory';
import { readMemoryChangeNote } from '@heynixie/memory';
import type { EventRegistry, SystemMessageType, TurnNote } from '@heynixie/models';
import {
  formatMessageTime,
  readEventsNote,
  readTurnNoteRange,
  renderSystemMessage,
} from '@heynixie/models';
import type { Clock } from '@heynixie/tasks';

export interface TurnNotesOptions {
  readonly log: Pick<Log, 'writer'>;
  readonly store: Pick<MemoryStore, 'recall'>;
  readonly events: EventRegistry;

  // the clock the note's messages take their time from
  readonly clock: Pick<Clock, 'now'>;

  // the owner's name, or null for "the owner"
  readonly ownerName: string | null;

  // the zone events show in until one of the owner's messages carries a zone
  readonly defaultZone: string;
}

// Reads the note before the next turn: the memory changes, then the events, each as a system
// message over one range, so the next note starts where this one ends. Times show in the zone of
// the owner's newest message, as the time tool answers.
export async function readTurnNotes(options: TurnNotesOptions): Promise<TurnNote> {
  const range = await readTurnNoteRange(options.log);
  const messageZone = await findMessageTimeZone(options.log);
  const timeZone = messageZone ?? options.defaultZone;
  const [memory, events] = await Promise.all([
    readMemoryChangeNote(options.log, options.store, { cap: memoryNoteCap, range }),
    readEventsNote(options.events, range, { ownerName: options.ownerName, timeZone }),
  ]);
  const now = new Date(options.clock.now());
  const at = formatMessageTime(now, timeZone, { defaultZone: options.defaultZone, now });
  const blocks = [
    renderNoteMessage('memory-changes', at, memory.text),
    renderNoteMessage('events', at, events),
  ].filter((block) => block !== null);

  return { text: blocks.length === 0 ? null : blocks.join('\n\n'), throughSequence: range.through };
}

function renderNoteMessage(
  type: SystemMessageType,
  at: string,
  body: string | null,
): string | null {
  return body === null ? null : renderSystemMessage({ type, at, body });
}

// the memory note lists up to 5 changed items, then how many more
const memoryNoteCap = 5;
