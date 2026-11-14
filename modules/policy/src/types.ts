import type {
  ConsentCheck,
  ContentSource,
  DecisionFault,
  DestinationPermission,
  JSONObject,
} from '@heynixie/log';
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

  // the definition ID of the task run, or null
  readonly task: string | null;
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

export interface CallDestination {
  readonly value: string;

  // true only for the sender of a message that nixie read, or the organizer of an event it read
  readonly replyTarget: boolean;
}

// A change of a tool's effects: the tool's declaration in code stays the base.
export interface EffectOverride {
  readonly add: readonly Effect[];
  readonly remove: readonly Effect[];
}

export interface PolicyCall {
  readonly tool: string;
  readonly toolList: readonly string[];
  readonly context: RuleContext;
  readonly definitionID: string | null;
  readonly args: Readonly<Record<string, unknown>>;
  readonly destinations: readonly CallDestination[];
  readonly sources: readonly RuleSource[];
  readonly at: number;

  // the sequence of the owner_message that started this turn; null in a task run
  readonly turnMessageSequence: number | null;

  // sequences of owner messages that a task_message carried to this task
  readonly onBehalfOf: readonly number[];

  // the snapshot hash of the definitions the call runs under
  readonly snapshot: string;
}

export type PolicyOutcome = 'allow' | 'ask' | 'deny';

export type PolicyStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type AskCause = 'outside_steering' | 'always_ask' | 'ask_rule' | 'no_rule';

export interface DecisionDetail {
  readonly outcome: PolicyOutcome;
  readonly stage: PolicyStage;
  readonly rule: {
    readonly id: string;
    readonly revision: number;
    readonly others: readonly string[];
  } | null;
  readonly cause?: AskCause;
  readonly defect?: 'direct_request' | 'repeat';
  readonly destinations: readonly {
    readonly value: string;
    readonly permission: DestinationPermission | null;
  }[];
  readonly consent?: ConsentCheck;
  readonly snapshot: string;
  readonly fault?: DecisionFault;
}

export interface PolicyDecision {
  readonly decision: DecisionDetail;
  readonly sentence: string | null;
}

export interface RuleEntry {
  readonly id: string;
  readonly revision: number;
  readonly rule: Rule;
}

// A contact the owner marked as known. A record forget erases the details, which leaves both null.
export interface KnownContact {
  readonly contactID: string;
  readonly name: string | null;
  readonly destination: string | null;
}

// What the decision point reads from the snapshot a call runs under, never from the latest one.
export interface PolicyInputs {
  readonly rules: readonly RuleEntry[];
  readonly contacts: readonly KnownContact[];
  readonly tools: ReadonlyMap<string, EffectDeclaration>;
  readonly ownerDestinations: readonly string[];
}

export interface ConsentMessage {
  readonly sequence: number;
  readonly text: string;
  readonly spans: readonly {
    readonly start: number;
    readonly end: number;
    readonly source: 'typed' | 'pasted' | 'dropped' | 'unknown';
  }[];
  readonly sentAt: number;
}

export interface ConsentAnswer {
  readonly verdict: 'asserted' | 'not_asserted' | 'unsure';
  readonly failure: 'timeout' | 'error' | 'unreadable' | null;
}

interface ConsentCheckRequest {
  readonly prompt: string;
  readonly input: string;
}

export type RunConsentCheck = (request: ConsentCheckRequest) => Promise<ConsentAnswer>;

// The stage a decision point is running, which a fault wrapper reads when the point throws or stalls.
export interface StageProgress {
  stage: PolicyStage;
}

export type DecisionPoint = (call: PolicyCall, progress?: StageProgress) => Promise<PolicyDecision>;
