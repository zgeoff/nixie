import { renderEventsBlock } from './render-events-block';
import type { EventRegistry, EventSettings, TurnNoteRange } from './types';

// Reads every registered kind's events in the range, picks the oldest up to the cap, and has each
// kind complete only its listed events, so nothing past the cap is read in full or recorded as
// delivered. It renders the events block, or null when nothing happened.
export async function readEventsNote(
  registry: EventRegistry,
  range: TurnNoteRange,
  settings: EventSettings,
): Promise<string | null> {
  const read = await Promise.all(registry.map((kind) => kind.read(range)));
  const events = read.flat().toSorted((left, right) => left.sequence - right.sequence);
  const listed = events.slice(0, eventsCap);
  const completed = await Promise.all(
    registry.map((kind) => kind.complete(listed.filter((event) => event.kind === kind.name))),
  );

  return renderEventsBlock(completed.flat(), events.length - listed.length, settings);
}

// the block lists up to 10 events, then how many more
const eventsCap = 10;
