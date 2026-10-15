import { readEventsBlock } from './read-events-block';
import type { EventRegistry, EventSettings, TurnNoteRange } from './types';

// Reads the events block for the next turn over the range, or null when nothing happened.
export async function readEventsNote(
  registry: EventRegistry,
  range: TurnNoteRange,
  settings: EventSettings,
): Promise<string | null> {
  const block = await readEventsBlock(registry, range, settings);

  return block.text;
}
