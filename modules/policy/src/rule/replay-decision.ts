import type { Decision, JSONObject } from '@heynixie/log';
import type { CallDestination, Effect, PolicyDecision } from '../types';
import { effectNames } from '../utils/effect-names';
import type { DecisionPointOptions } from './make-decision-point';
import { makeDecisionPoint } from './make-decision-point';

export type ReplayOptions = Pick<
  DecisionPointOptions,
  'findDeclaration' | 'findTaskDestinations' | 'readInputs'
>;

// What a tool_called record holds: the call's input and destinations, the decision it stored and
// the snapshot its envelope names.
export interface ReplayRecord {
  readonly tool: string;
  readonly input: JSONObject;
  readonly destinations: readonly CallDestination[];
  readonly decision: Decision;
  readonly snapshot: string;
  readonly at: number;
}

// Runs every stage again from the record. The checker is a model, so the code check and the
// checker's answer come from the record. A record from before the full decision point holds no
// inputs, and has no replay.
export function replayDecision(
  options: ReplayOptions,
  record: ReplayRecord,
): Promise<PolicyDecision | null> {
  const inputs = record.decision.inputs;

  if (inputs === undefined) {
    return Promise.resolve(null);
  }

  const recorded = record.decision.consentCheck ?? null;

  const decide = makeDecisionPoint({
    ...options,
    readConsent: () => Promise.resolve(recorded),
  });

  return decide({
    tool: record.tool,
    toolList: inputs.toolList,
    context: inputs.context,
    definitionID: inputs.definitionID,
    args: record.input,
    destinations: record.destinations,
    sources: inputs.sources,
    at: record.at,
    ...(inputs.effects === undefined ? {} : { effects: inputs.effects.filter(isEffect) }),
    ...(inputs.placeEffects === undefined
      ? {}
      : { placeEffects: inputs.placeEffects.filter(isEffect) }),
    turnMessageSequence: inputs.turnMessageSequence,
    onBehalfOf: inputs.onBehalfOf,
    snapshot: record.snapshot,
  });
}

function isEffect(name: string): name is Effect {
  return effectNames.some((effect) => effect === name);
}
