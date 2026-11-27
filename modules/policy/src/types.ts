import type {
  ConsentCheck,
  ContentSource,
  DecisionFault,
  DecisionLift,
  DecisionPlace,
  DestinationPermission,
  JSONObject,
} from '@heynixie/log';
import type { z } from 'zod';
import type { PlaceEntry } from './place/types';
import type { ruleBodySchema } from './rule/rule-body-schema';
import type { ruleContexts } from './rule/rule-contexts';
import type { ruleSources } from './rule/rule-sources';
import type { effectNames } from './utils/effect-names';

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

  // the top-level argument names that the tool declares as content, which a condition never reads
  readonly contentArgs: readonly string[];
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

  // set on a call whose act lands where its destination says, so stages 7 and 8 never allow it
  // with no destination; part of the declaration that the snapshot hash covers
  readonly requiresDestination?: true;
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

// How an interrupted queued call of a proxied tool settles: it retries under an idempotency key
// that the proxy puts in the named argument, or it reads the named read tool of the same server.
export type McpReconcile = { readonly idempotencyKey: string } | { readonly check: string };

// The declaration that the definitions repo gives one tool of an MCP server, in place of the one its
// annotations make.
export interface McpToolOverride {
  readonly effects: readonly Effect[];

  // argument names, as `a.b` for a nested one, `a[]` for an array's items and `a.*` for free keys
  readonly destinations: readonly string[];
  readonly amount: string | null;

  // null keeps the default: every string argument
  readonly content: readonly string[] | null;
  readonly reconcile: McpReconcile | null;
}

// The overrides of the definitions: by server ID, then by the tool's own name at the server.
export type McpOverrides = Readonly<Record<string, Readonly<Record<string, McpToolOverride>>>>;

export interface PolicyCall {
  readonly tool: string;
  readonly toolList: readonly string[];
  readonly context: RuleContext;
  readonly definitionID: string | null;
  readonly args: Readonly<Record<string, unknown>>;
  readonly destinations: readonly CallDestination[];
  readonly sources: readonly RuleSource[];
  readonly at: number;

  // Joins the effects in force for the tool, for a call whose effects depend on what its input
  // names. A call without it takes the effects in force alone.
  readonly effects?: readonly Effect[];

  // every effect the call has once its tool's prepare step has run, which the places judge by
  readonly placeEffects?: readonly Effect[];

  // the sequence of the owner_message that started this turn; null in a task run
  readonly turnMessageSequence: number | null;

  // sequences of owner messages that a task_message carried to this task
  readonly onBehalfOf: readonly number[];

  // the snapshot hash of the definitions the call runs under
  readonly snapshot: string;
}

// gate: no rule decided a memory write, so the memory gate decides it
export type PolicyOutcome = 'allow' | 'ask' | 'deny' | 'gate';

export type PolicyStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type AskCause =
  | 'outside_steering'
  | 'always_ask'
  | 'ask_rule'
  | 'no_rule'
  | 'condition_error';

// A rule whose condition errored on the call. `missing` names the argument a call left out, and
// never reaches the log.
export interface ConditionError {
  readonly ruleID: string;
  readonly outcome: RuleOutcome;
  readonly revision: number;
  readonly code: string;
  readonly missing?: string;
}

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

  // a deny: the first blocked place in destination order; an allow at stage 7: every place that
  // allowed it; unset when no place decided
  readonly places?: readonly DecisionPlace[];
  readonly consent?: ConsentCheck;
  readonly snapshot: string;
  readonly fault?: DecisionFault;

  // every rule whose condition errored on this call, whatever its outcome
  readonly conditionErrors?: readonly ConditionError[];

  // set when an allow rule's lift let a purchase past stage 4
  readonly lift?: DecisionLift;
}

// An allow rule that matched the call, with the checks the memory gate reads to see what it covers.
export interface AllowingRule {
  readonly id: string;
  readonly revision: number;
  readonly checks: readonly RuleCheck[];
}

// What a call to a tool that declares memory_write carries to the tool, beside the stored decision.
export interface MemoryWriteFacts {
  // every allow rule that matched the call, by ID; the first is the rule the decision names
  readonly allowing: readonly AllowingRule[];

  // set for a tool whose held call is an action proposal, so an ask rule holds it there and not as
  // a memory proposal
  readonly holdsAsAction?: true;
}

// An allow rule that matched the call and lists the call's tool by its exact name.
export interface NamingRule {
  readonly id: string;
  readonly revision: number;
}

export interface PolicyDecision {
  readonly decision: DecisionDetail;
  readonly sentence: string | null;

  // present only on an allow by a rule, when a matched allow rule lists the tool by its exact name
  readonly namingRules?: readonly NamingRule[];

  // present only when the declaration the decision used holds memory_write
  readonly memoryWrite?: MemoryWriteFacts;
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

// An entry of the directory as a call reads it: the name serves the consent check's typed-name match.
export interface PolicyPlace extends PlaceEntry {
  readonly name: string | null;
}

// What the decision point reads from the snapshot a call runs under, never from the latest one.
export interface PolicyInputs {
  readonly rules: readonly RuleEntry[];
  readonly places: readonly PolicyPlace[];
  readonly tools: ReadonlyMap<string, EffectDeclaration>;
}

export interface ConsentMessage {
  readonly sequence: number;
  readonly text: string;
  readonly spans: readonly {
    readonly start: number;
    readonly end: number;
    readonly source: 'typed' | 'pasted' | 'dropped' | 'dictated' | 'unknown';
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
