import type { DefinitionsSource } from '@heynixie/definitions';

export interface StubHeldSource {
  // the source, whose first snapshot waits for release before it returns
  readonly source: DefinitionsSource;

  // 'start' when a snapshot call begins and 'end' when it returns, in the order they happened
  readonly events: readonly ('start' | 'end')[];
  readonly release: () => void;
}

// Builds a definitions source that holds its first snapshot until the test releases it, and
// records when each snapshot call begins and returns, so a test sees whether 2 seeds overlapped.
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
