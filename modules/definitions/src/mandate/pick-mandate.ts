import type { Rule } from '@heynixie/policy';
import { pickNextMidnight } from '@heynixie/proposals';
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

export type MandatePick =
  | { readonly status: 'ok'; readonly expires: number; readonly rules: readonly MandateRule[] }
  | { readonly status: 'refused'; readonly reason: 'expires_past' | 'expires_beyond_max' };

// Every rule of the mandate takes the mandate's ID and its end, so the decision point stops each at
// the end whether the timer has run or not.
export function pickMandate(input: MandateInput, facts: MandateFacts): MandatePick {
  const expires =
    input.expires === undefined
      ? pickNextMidnight(facts.now, facts.zone)
      : Date.parse(input.expires);

  if (expires <= facts.now) {
    return { status: 'refused', reason: 'expires_past' };
  }

  if (expires > facts.now + facts.maxHours * hourMs) {
    return { status: 'refused', reason: 'expires_beyond_max' };
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
