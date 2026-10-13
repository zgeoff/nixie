import type { Log } from '@heynixie/log';
import type { MemoryStore } from '@heynixie/memory';
import { readMemoryChangeNote } from '@heynixie/memory';
import type { EventRegistry, EventSettings, TurnNote } from '@heynixie/models';
import { readEventsNote, readTurnNoteRange } from '@heynixie/models';

export interface TurnNotesOptions {
  readonly log: Pick<Log, 'writer'>;
  readonly store: Pick<MemoryStore, 'recall'>;
  readonly events: EventRegistry;
  readonly settings: EventSettings;
}

// Reads the note before the conversation's next turn: the memory changes, then the events, since
// its last turn. Both read one range, so the next turn's note starts where this one ends.
export async function readTurnNotes(options: TurnNotesOptions): Promise<TurnNote> {
  const range = await readTurnNoteRange(options.log);
  const [memory, events] = await Promise.all([
    readMemoryChangeNote(options.log, options.store, { cap: memoryNoteCap, range }),
    readEventsNote(options.events, range, options.settings),
  ]);
  const blocks = [memory.text, events].filter((block) => block !== null);

  return { text: blocks.length === 0 ? null : blocks.join('\n\n'), throughSequence: range.through };
}

// the memory note lists up to 5 changed items, then how many more
const memoryNoteCap = 5;
