import type { JSONObject } from '@heynixie/log';
import { describeRuleCondition, parseRule, renderRule } from '@heynixie/policy';
import type { RuleCondition } from '@heynixie/policy';
import { match } from 'ts-pattern';
import { z } from 'zod';

export type MandateState = 'pending' | 'active' | 'rejected' | 'lapsed' | 'ended' | 'expired';

export interface ListedMandate {
  readonly shortID: string;
  readonly mandateID: string;

  // null once a record forget removed the proposal's fields
  readonly title: string | null;
  readonly state: MandateState;

  // milliseconds since the epoch
  readonly expires: number;
  readonly sentences: readonly string[];

  // the condition of each rule that holds one, by the rule's place among the sentences
  readonly conditions: readonly (RuleCondition & { readonly rule: number })[];
}

export type MandateEvent =
  | {
      readonly type: 'proposed';
      readonly proposed: {
        readonly proposalID: string;
        readonly shortID: string;
        readonly mandateID: string;
        readonly expires: number;
      };
      readonly fields: JSONObject | null;
    }
  | { readonly type: 'started'; readonly mandateID: string; readonly expires: number }
  | { readonly type: 'declined'; readonly proposalID: string }
  | { readonly type: 'lapsed'; readonly proposalID: string }
  | { readonly type: 'ended'; readonly mandateID: string; readonly reason: 'ended' | 'expired' };

const mandateListLimit = 50;

// Folds the mandate records, oldest first, into one entry per mandate, the newest proposal first.
export function collectMandateList(
  events: readonly MandateEvent[],
  now: number,
): readonly ListedMandate[] {
  const mandates = new Map<string, ListedMandate>();
  const mandateIDs = new Map<string, string>();

  for (const event of events) {
    if (event.type === 'proposed') {
      mandateIDs.set(event.proposed.proposalID, event.proposed.mandateID);
      mandates.set(event.proposed.mandateID, buildProposedMandate(event));
      continue;
    }

    const mandateID =
      event.type === 'declined' || event.type === 'lapsed'
        ? mandateIDs.get(event.proposalID)
        : event.mandateID;

    const found = mandateID === undefined ? undefined : mandates.get(mandateID);

    if (found !== undefined) {
      mandates.set(found.mandateID, buildMandateInState(found, pickRecordState(event)));
    }
  }

  return [...mandates.values()]
    .toReversed()
    .slice(0, mandateListLimit)
    .map((mandate) => buildMandateInState(mandate, pickCurrentState(mandate, now)));
}

const proposedFieldsSchema = z.object({ title: z.string(), rules: z.array(z.unknown()) });

function buildProposedMandate(event: Extract<MandateEvent, { type: 'proposed' }>): ListedMandate {
  const parsed = event.fields === null ? null : proposedFieldsSchema.parse(event.fields);

  return {
    shortID: event.proposed.shortID,
    mandateID: event.proposed.mandateID,
    title: parsed?.title ?? null,
    state: 'pending',
    expires: event.proposed.expires,
    sentences: parsed?.rules.map((rule) => renderRule(parseRule(rule))) ?? [],
    conditions: collectConditions(parsed?.rules ?? []),
  };
}

function collectConditions(
  rules: readonly unknown[],
): readonly (RuleCondition & { readonly rule: number })[] {
  return rules.flatMap((rule, index) => {
    const condition = describeRuleCondition(parseRule(rule), 'nixie');

    return condition === undefined ? [] : [{ ...condition, rule: index + 1 }];
  });
}

function buildMandateInState(mandate: ListedMandate, state: MandateState): ListedMandate {
  return { ...mandate, state };
}

function pickRecordState(event: Exclude<MandateEvent, { type: 'proposed' }>): MandateState {
  return match(event)
    .returnType<MandateState>()
    .with({ type: 'started' }, () => 'active')
    .with({ type: 'declined' }, () => 'rejected')
    .with({ type: 'lapsed' }, () => 'lapsed')
    .with({ type: 'ended' }, (ended) => ended.reason)
    .exhaustive();
}

// A pending proposal or an active mandate past its expiry is over before the sweep closes it.
function pickCurrentState(mandate: ListedMandate, now: number): MandateState {
  if (mandate.expires > now) {
    return mandate.state;
  }

  return match(mandate.state)
    .returnType<MandateState>()
    .with('pending', () => 'lapsed')
    .with('active', () => 'expired')
    .with('rejected', 'lapsed', 'ended', 'expired', (state) => state)
    .exhaustive();
}
