import type { DefinitionsSource } from '@heynixie/definitions';

export interface StubHeldSource {
  readonly source: DefinitionsSource;

  readonly events: readonly ('start' | 'end')[];
  readonly release: () => void;
}

export function buildStubHeldSource(source: DefinitionsSource): StubHeldSource {
  const gate = Promise.withResolvers<void>();
  const events: ('start' | 'end')[] = [];
  const state = { isFirst: true };

  return {
    source: {
      ...source,
      snapshot: async () => {
        events.push('start');

        const isHeld = state.isFirst;

        state.isFirst = false;

        const snapshot = await source.snapshot();

        if (isHeld) {
          await gate.promise;
        }

        events.push('end');

        return snapshot;
      },
    },
    events,
    release: () => {
      gate.resolve();
    },
  };
}
