import type { EventKind, EventRegistry } from './types';

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
