import type { BoundEvent, EventKind, EventRegistry, NotedEvent, ReadEvent } from './types';

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

function buildRegistryEntry(kind: EventKind<unknown>): EventRegistry[number] {
  const details = new WeakMap<ReadEvent, NotedEvent<unknown>>();

  return {
    name: kind.name,
    isUncapped: kind.isUncapped === true,
    isSessionBound: kind.isSessionBound === true,
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
