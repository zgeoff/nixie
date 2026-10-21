import type { ContentSource, Decision } from '@heynixie/log';

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

export interface EffectDeclaration {
  readonly effects: readonly Effect[];

  readonly destinations: readonly string[];

  readonly amount: string | null;

  readonly content: readonly string[];

  readonly results: Readonly<Record<string, ContentSource>>;
}

export interface PolicyCall {
  readonly tool: string;
  readonly toolList: readonly string[];
}

export type PolicyOutcome = 'allow' | 'deny';

export interface PolicyDecision {
  readonly decision: Decision & { readonly outcome: PolicyOutcome };
  readonly sentence: string | null;
}

export interface FixedRule {
  readonly id: string;
  readonly revision: number;
  readonly sentence: string;
  readonly pickOutcome: (call: PolicyCall, declaration: EffectDeclaration) => PolicyOutcome | null;
}

export type DecisionPoint = (call: PolicyCall) => PolicyDecision;
