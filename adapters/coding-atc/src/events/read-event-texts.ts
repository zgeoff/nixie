import type { ATCFleet } from '../call/connect-atc';
import type { TrailEvent } from '../types';

// The text of one note or answer, or why atc gave none.
export type EventText =
  | { readonly text: string; readonly isComplete: boolean }
  | { readonly error: string };

// The text of each note and answer in the events, by the event's cursor. The trail holds a preview
// only, and atc keeps the whole text apart.
export async function readEventTexts(
  atc: ATCFleet,
  events: readonly TrailEvent[],
  signal: AbortSignal,
): Promise<ReadonlyMap<string, EventText>> {
  const texts = new Map<string, EventText>();

  for (const event of events) {
    if (event.kind === 'note') {
      const text = await readText(() => readNote(atc, event, signal));

      texts.set(event.cursor, text);
    }

    if (event.kind === 'message-answered') {
      const text = await readText(() => readAnswer(atc, event, signal));

      texts.set(event.cursor, text);
    }
  }

  return texts;
}

async function readText(
  read: () => Promise<{ text: string; isComplete: boolean }>,
): Promise<EventText> {
  try {
    return await read();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function readNote(atc: ATCFleet, event: TrailEvent, signal: AbortSignal) {
  const read = await atc.note.get({ note: event.note ?? event.cursor }, { signal });

  return { text: read.text, isComplete: read.complete };
}

async function readAnswer(atc: ATCFleet, event: TrailEvent, signal: AbortSignal) {
  const read = await atc.answer.get({ answer: event.answer ?? event.cursor }, { signal });

  return { text: read.text, isComplete: read.complete };
}
