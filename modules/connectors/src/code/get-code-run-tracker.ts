export interface CodeRunTracking {
  // whether a forget named this call since it began
  readonly isForgotten: () => boolean;

  // the call is over, so a later forget has nothing to flag
  readonly end: () => void;
}

export interface CodeRunTracker {
  // starts tracking a call, so a forget that finds no sandbox for it yet can still reach it
  readonly start: (callID: string) => CodeRunTracking;

  // flags each of the calls that is still in flight; a flagged call destroys its sandbox as soon
  // as it exists, and runs nothing in it
  readonly flagForgotten: (callIDs: readonly string[]) => void;
}

interface TrackedCall {
  isForgotten: boolean;
}

// A forget and the calls it reaches hold the same sandbox adapter, so the adapter keys what they
// share.
const trackersByAdapter = new WeakMap<object, CodeRunTracker>();

export function getCodeRunTracker(adapter: object): CodeRunTracker {
  const known = trackersByAdapter.get(adapter);

  if (known !== undefined) {
    return known;
  }

  const calls = new Map<string, TrackedCall>();

  const tracker: CodeRunTracker = {
    start: (callID) => {
      const tracked: TrackedCall = { isForgotten: false };

      calls.set(callID, tracked);

      return {
        isForgotten: () => tracked.isForgotten,
        end: () => {
          if (calls.get(callID) === tracked) {
            calls.delete(callID);
          }
        },
      };
    },
    flagForgotten: (callIDs) => {
      for (const callID of callIDs) {
        const tracked = calls.get(callID);

        if (tracked !== undefined) {
          tracked.isForgotten = true;
        }
      }
    },
  };

  trackersByAdapter.set(adapter, tracker);

  return tracker;
}
