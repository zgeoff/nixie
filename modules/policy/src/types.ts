import type { ContentSource, Decision, JSONObject } from '@heynixie/log';
import type { z } from 'zod';
import type { effectNames } from './effect-names';
import type { ruleBodySchema } from './rule-body-schema';
import type { ruleContexts } from './rule-contexts';
import type { ruleSources } from './rule-sources';

export type Effect = (typeof effectNames)[number];

type RuleBody = z.output<typeof ruleBodySchema>;

export type Rule = Readonly<{ id: string } & RuleBody>;

export type RuleForm = Rule & JSONObject;

export type RuleOutcome = Rule['outcome'];

export type RuleCheck = NonNullable<Rule['checks']>[number];

export type RuleContext = (typeof ruleContexts)[number];

export type RuleSource = (typeof ruleSources)[number];

export interface RuleCall {
  readonly tool: string;
  readonly effects: readonly Effect[];
  readonly context: RuleContext;
  readonly job: string | null;
  readonly args: Readonly<Record<string, unknown>>;
  readonly destinations: readonly string[];
  readonly sources: readonly RuleSource[];
  readonly at: number;
}

export type RuleChange = 'narrowing' | 'widening' | 'unchanged';

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
