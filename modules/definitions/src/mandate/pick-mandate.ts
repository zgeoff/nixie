import type { Rule } from '@heynixie/policy';
import { pickNextMidnight } from '@heynixie/proposals';
import { formatZonedISO } from '@heynixie/triggers';
import type { MandateInput } from './mandate-input-schema';

const hourMs = 60 * 60 * 1000;

export interface MandateFacts {
  readonly mandateID: string;
  readonly now: number;
  readonly zone: string;
  readonly maxHours: number;
}

export interface MandateRule {
  readonly ruleID: string;
  readonly rule: Omit<Rule, 'id'>;
}

export type MandateRefusal =
  | {
      readonly status: 'refused';
      readonly reason: 'invalid_condition';

      // the rule's place in the mandate, as `rules.1`, with the fault code and its detail
      readonly faults: readonly string[];
    }
  | { readonly status: 'refused'; readonly reason: 'expires_past'; readonly now: string }
  | {
      readonly status: 'refused';
      readonly reason: 'expires_beyond_max';
      readonly maxHours: number;
      readonly latestExpiry: string;
    };

export type MandatePick =
  | { readonly status: 'ok'; readonly expires: number; readonly rules: readonly MandateRule[] }
  | MandateRefusal;

// Every rule of the mandate takes the mandate's ID and its end, so the decision point stops each at
// the end whether the timer has run or not.
export function pickMandate(input: MandateInput, facts: MandateFacts): MandatePick {
  const expires =
    input.expires === undefined
      ? pickNextMidnight(facts.now, facts.zone)
      : Date.parse(input.expires);

  if (expires <= facts.now) {
    return {
      status: 'refused',
      reason: 'expires_past',
      now: formatZonedISO(facts.now, facts.zone),
    };
  }

  const latest = facts.now + facts.maxHours * hourMs;

  if (expires > latest) {
    return {
      status: 'refused',
      reason: 'expires_beyond_max',
      maxHours: facts.maxHours,
      latestExpiry: formatZonedISO(latest, facts.zone),
    };
  }

  return {
    status: 'ok',
    expires,
    rules: input.rules.map((rule, index) => ({
      ruleID: `${facts.mandateID}-${index + 1}`,
      rule: { ...rule, mandate: facts.mandateID, expires: new Date(expires).toISOString() },
    })),
  };
}
