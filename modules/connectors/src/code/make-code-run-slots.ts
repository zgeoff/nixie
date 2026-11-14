export interface CodeRunSlots {
  // false when every slot is taken
  readonly take: () => boolean;
  readonly release: () => void;
}

// The code runs of one server process, counting a sandbox that still waits on a destroy.
export function makeCodeRunSlots(count: number): CodeRunSlots {
  const state = { taken: 0 };

  return {
    take: () => {
      if (state.taken >= count) {
        return false;
      }

      state.taken += 1;

      return true;
    },
    release: () => {
      state.taken -= 1;
    },
  };
}
