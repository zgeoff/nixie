import type { BoundEvent, EventKind, EventRegistry, NotedEvent, ReadEvent } from './types';

// Builds the registry the events block reads from a list of event kinds, so a new kind is one more
// entry and no change to the block. It refuses two kinds with one name.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the rule cannot resolve a mapped tuple over a type parameter, though each entry is readonly
export function buildEventRegistry<Details extends readonly unknown[]>(kinds: {
  readonly [Index in keyof Details]: EventKind<Details[Index]>;
}): EventRegistry {
  const entries: readonly EventKind<unknown>[] = kinds;
  const names = entries.map((kind) => kind.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);

  if (repeated !== undefined) {
    throw new Error(`the events block has two event kinds named ${repeated}`);
  }
  return entries.map((kind) => buildRegistryEntry(kind));
}

// Each event the entry read keeps its detail out of sight of the block, so complete finds it again
// by the event the block hands back.
function buildRegistryEntry(kind: EventKind<unknown>): EventRegistry[number] {
  const details = new WeakMap<ReadEvent, NotedEvent<unknown>>();

  return {
    name: kind.name,
    read: async (range) => {
      const events = await kind.read(range);

      return events.map((event) => {
        const read = { kind: kind.name, sequence: event.sequence, at: event.at };

        details.set(read, event);
        return read;
      });
    },
    complete: async (events) => {
      const noted = events.flatMap((event) => {
        const found = details.get(event);

        return found === undefined ? [] : [found];
      });
      const completed = kind.complete === undefined ? noted : await kind.complete(noted);

      return completed.map((event): BoundEvent => ({
        sequence: event.sequence,
        at: event.at,
        render: (settings) => kind.render(event.detail, settings),
      }));
    },
  };
}
