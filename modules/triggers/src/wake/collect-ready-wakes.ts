import type { WakeRule } from '../types';
import { isWakeRuleReady } from './is-wake-rule-ready';
import type { LiveWakeRule } from './read-live-wake-rules';

export interface HeldMatch {
  readonly ruleID: string;
  readonly targetTaskID: string;
  readonly arrivedSeq: number;
}

export interface ReadyWake {
  readonly targetTaskID: string;

  // every rule of the matches, each once
  readonly rules: readonly WakeRule[];

  // the sequences of the arrivals, oldest first
  readonly arrived: readonly number[];
}

// A held match is ready when one of its rules is. A target wakes once, with every ready match of
// its own, oldest first.
export function collectReadyWakes(
  held: readonly HeldMatch[],
  rules: ReadonlyMap<string, LiveWakeRule>,
  nowMs: number,
): ReadyWake[] {
  const matches = new Map<string, { targetTaskID: string; arrived: number; ruleIDs: string[] }>();

  for (const entry of held) {
    const key = `${entry.targetTaskID}\n${String(entry.arrivedSeq)}`;

    const match = matches.get(key) ?? {
      targetTaskID: entry.targetTaskID,
      arrived: entry.arrivedSeq,
      ruleIDs: [],
    };

    matches.set(key, { ...match, ruleIDs: [...match.ruleIDs, entry.ruleID] });
  }

  const wakes = new Map<string, { arrived: number[]; ruleIDs: Set<string> }>();

  for (const match of matches.values()) {
    const entries = match.ruleIDs.flatMap((ruleID) => rules.get(ruleID) ?? []);

    if (!entries.some((entry) => isWakeRuleReady(entry, nowMs))) {
      continue;
    }

    const wake = wakes.get(match.targetTaskID) ?? { arrived: [], ruleIDs: new Set<string>() };

    wake.arrived.push(match.arrived);

    for (const ruleID of match.ruleIDs) {
      wake.ruleIDs.add(ruleID);
    }

    wakes.set(match.targetTaskID, wake);
  }

  return [...wakes].map(([targetTaskID, wake]) => ({
    targetTaskID,
    rules: [...wake.ruleIDs].flatMap((ruleID) => rules.get(ruleID)?.rule ?? []),
    arrived: wake.arrived.toSorted((left, right) => left - right),
  }));
}
