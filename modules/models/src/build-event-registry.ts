import type { EventKind, EventRegistry } from './types';

// Builds the registry the events block reads from a list of event kinds, so a new kind is one more
// entry here and no change to the block. Two kinds with one name are refused, because the name is
// how a reader tells the kinds apart.
export function buildEventRegistry<Details extends readonly unknown[]>(kinds: {
  readonly [Index in keyof Details]: EventKind<Details[Index]>;
}): EventRegistry {
  const entries: readonly EventKind<unknown>[] = kinds;
  const names = entries.map((kind) => kind.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);

  if (repeated !== undefined) {
    throw new Error(`the events block has two event kinds named ${repeated}`);
  }
  return entries.map((kind) => ({
    name: kind.name,
    read: async (range) => {
      const events = await kind.read(range);

      return events.map((event) => ({
        sequence: event.sequence,
        at: event.at,
        render: (settings) => kind.render(event.detail, settings),
      }));
    },
  }));
}
