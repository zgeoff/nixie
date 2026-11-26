import type { Mailbox, WakeRule } from '../types';
import { buildMailboxKey } from './build-mailbox-key';
import { isWakeRuleReady } from './is-wake-rule-ready';
import type { LiveWakeRule } from './read-live-wake-rules';

export interface HeldMatch {
  readonly ruleID: string;
  readonly targetTaskID: string;
  readonly arrivedSeq: number;
}

export interface ReadyWake {
  readonly targetTaskID: string;

  // the mailbox of every rule of the wake: a wake shows the mail of one mailbox
  readonly mailbox: Mailbox;

  // every rule of the matches, each once
  readonly rules: readonly WakeRule[];

  // the sequences of the arrivals, oldest first
  readonly arrived: readonly number[];
}

// A held match is ready when one of its rules is. A target wakes once for each mailbox, with every
// ready match of that mailbox, oldest first.
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

  const wakes = new Map<
    string,
    { targetTaskID: string; mailbox: Mailbox; arrived: number[]; ruleIDs: Set<string> }
  >();

  for (const match of matches.values()) {
    const entries = match.ruleIDs.flatMap((ruleID) => rules.get(ruleID) ?? []);
    const [first] = entries;

    if (first === undefined || !entries.some((entry) => isWakeRuleReady(entry, nowMs))) {
      continue;
    }

    const key = `${match.targetTaskID}\n${buildMailboxKey(first.rule.mailbox)}`;

    const wake = wakes.get(key) ?? {
      targetTaskID: match.targetTaskID,
      mailbox: first.rule.mailbox,
      arrived: [],
      ruleIDs: new Set<string>(),
    };

    wake.arrived.push(match.arrived);

    for (const ruleID of match.ruleIDs) {
      wake.ruleIDs.add(ruleID);
    }

    wakes.set(key, wake);
  }

  return [...wakes.values()].map((wake) => ({
    targetTaskID: wake.targetTaskID,
    mailbox: wake.mailbox,
    rules: [...wake.ruleIDs].flatMap((ruleID) => rules.get(ruleID)?.rule ?? []),
    arrived: wake.arrived.toSorted((left, right) => left - right),
  }));
}
