import type { EventsBlockSettings } from './render-events-block';
import { renderEventsBlock } from './render-events-block';
import type { EventRegistry, TurnNoteRange } from './types';

// The events block over one range and how many events the range held, those past the cap included.
export interface EventsBlock {
  readonly text: string | null;
  readonly count: number;
}

// How the block reads: its render settings, and whether the turn it goes before opens a new session.
export interface EventsBlockRead extends EventsBlockSettings {
  readonly isNewSession?: boolean;
}

// Reads the events in the range, with no session-bound kind for a new session or a replay, picks
// uncapped kinds' events and the oldest others up to the cap, and has each kind complete only its
// listed events, so nothing past the cap is read in full or recorded as delivered.
export async function readEventsBlock(
  everyKind: EventRegistry,
  range: TurnNoteRange,
  settings: EventsBlockRead,
): Promise<EventsBlock> {
  const isNewSession = settings.isNewSession === true || settings.isReplay === true;
  const registry = isNewSession ? everyKind.filter((kind) => !kind.isSessionBound) : everyKind;

  const read = await Promise.all(registry.map((kind) => kind.read(range)));

  const uncapped = new Set(registry.filter((kind) => kind.isUncapped).map((kind) => kind.name));

  const events = read.flat().toSorted((left, right) => left.sequence - right.sequence);

  const listed = [
    ...events.filter((event) => uncapped.has(event.kind)),
    ...events.filter((event) => !uncapped.has(event.kind)).slice(0, eventsCap),
  ];

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
