import type { EventsBlockSettings } from './render-events-block';
import { renderEventsBlock } from './render-events-block';
import type { EventRegistry, TurnNoteRange } from './types';

// The events block over one range and how many events the range held, those past the cap included.
export interface EventsBlock {
  readonly text: string | null;
  readonly count: number;
}

// Reads every registered kind's events in the range, picks the oldest up to the cap, and has each
// kind complete only its listed events, so nothing past the cap is read in full or recorded as
// delivered. It renders the events block, or null when nothing happened.
export async function readEventsBlock(
  registry: EventRegistry,
  range: TurnNoteRange,
  settings: EventsBlockSettings,
): Promise<EventsBlock> {
  const read = await Promise.all(registry.map((kind) => kind.read(range)));

  const events = read.flat().toSorted((left, right) => left.sequence - right.sequence);
  const listed = events.slice(0, eventsCap);

  const completed = await Promise.all(
    registry.map((kind) => kind.complete(listed.filter((event) => event.kind === kind.name))),
  );

  return {
    text: renderEventsBlock(completed.flat(), events.length - listed.length, settings),
    count: events.length,
  };
}

// the block lists up to 10 events, then how many more
const eventsCap = 10;
