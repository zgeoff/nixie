export interface DeviceLeader {
  // keeps this tab in the browser's choice of the tab that holds the device stream, until the
  // returned function runs
  readonly retain: () => () => void;
}

// Each route mounts a signed-in page of its own, so a route change drops one page and mounts the
// next in one step. The tab keeps its place, and its stream, across that step.
export function createDeviceLeader(start: () => () => void): DeviceLeader {
  const state: { retained: number; stop: (() => void) | null } = { retained: 0, stop: null };

  return {
    retain: () => {
      state.retained += 1;
      state.stop ??= start();

      let isReleased = false;

      return () => {
        if (isReleased) {
          return;
        }

        isReleased = true;
        state.retained -= 1;

        queueMicrotask(() => {
          if (state.retained === 0 && state.stop !== null) {
            state.stop();

            state.stop = null;
          }
        });
      };
    },
  };
}
