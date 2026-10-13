import { renderEventsBlock } from './render-events-block';
import type { EventRegistry, EventSettings, TurnNoteRange } from './types';

// Reads every registered kind's events in the range and renders the events block, or null when
// nothing happened.
export async function readEventsNote(
  registry: EventRegistry,
  range: TurnNoteRange,
  settings: EventSettings,
): Promise<string | null> {
  const events = await Promise.all(registry.map((kind) => kind.read(range)));

  return renderEventsBlock(events.flat(), settings);
}
