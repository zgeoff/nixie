import type { ContentSource, Decision } from '@heynixie/log';

// What a tool does to the world. A tool's effects are fixed per tool and never depend on its
// arguments, so a rule reads the same for every call of a tool.
export type Effect =
  | 'read'
  | 'fetch'
  | 'note'
  | 'write'
  | 'delete'
  | 'send'
  | 'spend'
  | 'schedule'
  | 'code_run'
  | 'device'
  | 'policy_widen'
  | 'policy_narrow'
  | 'budget_raise'
  | 'budget_lower'
  | 'export';

// A tool's declaration in nixie's registry, which policy owns and rules match on.
export interface EffectDeclaration {
  readonly effects: readonly Effect[];

  // the names of the arguments that hold a destination
  readonly destinations: readonly string[];

  // the name of the argument that holds a spend's amount, or null
  readonly amount: string | null;

  // the names of the arguments that hold free-text content
  readonly content: readonly string[];

  // the source of content of each top-level field of the tool's result
  readonly results: Readonly<Record<string, ContentSource>>;
}

// A tool call as the decision point sees it: the tool's name and the caller's tool list, which is
// the job's list for a job run and the subset its caller passed for a worker.
export interface PolicyCall {
  readonly tool: string;
  readonly toolList: readonly string[];
}

// Slice 1 never asks: proposals arrive in slice 3, so a call that would ask has nowhere to wait.
export type PolicyOutcome = 'allow' | 'deny';

// The decision and the sentence the model receives with a deny, or null for an allow.
export interface PolicyDecision {
  readonly decision: Decision & { readonly outcome: PolicyOutcome };
  readonly sentence: string | null;
}

// A rule written in code. pickOutcome returns null when the rule does not cover the call.
export interface FixedRule {
  readonly id: string;
  readonly revision: number;
  readonly sentence: string;
  readonly pickOutcome: (call: PolicyCall, declaration: EffectDeclaration) => PolicyOutcome | null;
}

export type DecisionPoint = (call: PolicyCall) => PolicyDecision;
