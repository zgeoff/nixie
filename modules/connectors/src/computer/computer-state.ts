import type { JSONObject } from '@heynixie/log';

// What the computer tools remember between a call's preparation and its queued action. Nothing
// here survives a restart, and a lost entry makes the action refuse, so a restart fails safe.
export interface ComputerState {
  // the URL a tab held when a click or a fill was prepared, by action key
  readonly expectations: Map<string, string>;

  // the files count when a run was prepared, by action key
  readonly epochs: Map<string, number>;

  // the holds that keep a sandbox awake until its queued action runs, by action key
  readonly holds: Map<string, () => void>;

  // rises with each write to the shell's disk, so a waiting run can tell its files changed
  files: { count: number };
}

export function buildComputerState(): ComputerState {
  return {
    expectations: new Map(),
    epochs: new Map(),
    holds: new Map(),
    files: { count: 0 },
  };
}

// The key of a call in the state: its tool and its input with the keys sorted.
export function buildActionKey(tool: string, input: JSONObject): string {
  const sorted = Object.fromEntries(
    Object.entries(input).toSorted(([first], [second]) => first.localeCompare(second)),
  );

  return `${tool}\n${JSON.stringify(sorted)}`;
}
