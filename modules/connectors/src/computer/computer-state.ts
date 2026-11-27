import type { JSONObject } from '@heynixie/log';
import type { ScreenBinding } from '@heynixie/wire';

// The window a screen act was prepared for, with the part of the action hash that names it.
export interface ScreenPrepared {
  readonly binding: ScreenBinding;
  readonly expectWindow: JSONObject;

  // the hold's epoch when the act was prepared, so a hold since then refuses the act
  readonly epoch: number;
}

// What the computer tools remember between a call's preparation and its queued action. Nothing
// here survives a restart, and a lost entry makes the action refuse, so a restart fails safe.
export interface ComputerState {
  // the URL a tab held when a click or a fill was prepared, by action key
  readonly expectations: Map<string, string>;

  // whether the clicked control was a plain link when a click was prepared, by action key
  readonly clicks: Map<string, boolean>;

  // The windows a screen act was prepared for, by action key. Two calls with the same input can be
  // prepared against different windows, and each keeps its own entry until its action runs.
  readonly screens: Map<string, ScreenPrepared[]>;

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
    clicks: new Map(),
    screens: new Map(),
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
