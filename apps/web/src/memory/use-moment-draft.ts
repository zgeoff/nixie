import { useState } from 'react';

export interface MomentDraft<Value> {
  readonly value: Value;
  readonly baseVersion: number;
  readonly isOutdated: boolean;

  readonly change: (value: Value) => void;
  readonly takeLatest: () => void;
  readonly keepDraft: () => void;
  readonly markSaved: () => void;
}

interface DraftState<Value> {
  readonly base: Value;
  readonly value: Value;
  readonly version: number;
}

// A draft the user has not changed follows the latest read of the moment. A changed draft stays
// bound to the version it started from, so a save never writes over a change the user did not see.
export function useMomentDraft<Value>(latest: Value, version: number): MomentDraft<Value> {
  const [state, setState] = useState<DraftState<Value>>({ base: latest, value: latest, version });
  const isEdited = !isSameValue(state.value, state.base) && !isSameValue(state.value, latest);
  const current = isEdited ? state : { base: latest, value: latest, version };

  return {
    value: current.value,
    baseVersion: current.version,
    isOutdated: current.version !== version,
    change: (value) => {
      setState({ base: current.base, value, version: current.version });
    },
    takeLatest: () => {
      setState({ base: latest, value: latest, version });
    },
    keepDraft: () => {
      setState({ base: latest, value: current.value, version });
    },
    markSaved: () => {
      setState({ base: current.value, value: current.value, version: current.version });
    },
  };
}

function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
