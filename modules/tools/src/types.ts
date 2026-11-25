import type { ContentSource, Decision, JSONObject, WriteTransaction } from '@heynixie/log';
import type {
  AllowingRule,
  CallDestination,
  Effect,
  EffectDeclaration,
  NamingRule,
  RuleContext,
  RuleSource,
} from '@heynixie/policy';
import type { SandboxRef, ToolTarget } from '@heynixie/sandbox';
import type { ApprovedCallRequest, ApprovedRun } from './approved-call/run-approved-call';

export type JsonSchema = JSONObject;

export type ToolExecution = 'direct' | 'queued';

export interface ToolCall {
  readonly callID: string;
  readonly tool: string;
  readonly input: JSONObject;

  readonly toolUseID: string | null;
}

// What a tool reads before its call has a record.
export interface ToolResolveContext {
  readonly run: ToolRun;
}

export interface ToolContext extends ToolResolveContext {
  // the sequence of this call's tool_called record
  readonly callSequence: number;

  // What the decision point said about a call to a tool that declares memory_write. A call with no
  // verdict runs every check of the tool's own gate.
  readonly verdict?: MemoryWriteVerdict;

  // The allow rules that matched the call and list the tool by its exact name, present only when
  // a rule allowed the call and one such rule matched.
  readonly namingRules?: readonly NamingRule[];
}

export type MemoryWriteVerdict =
  | { readonly kind: 'rule-allow'; readonly rules: readonly AllowingRule[] }
  | {
      readonly kind: 'rule-ask';
      readonly rule: { readonly id: string; readonly revision: number };
    }
  | { readonly kind: 'gate' };

export type ToolOutcome =
  | ({ readonly status: 'ok' } & DirectResult)
  | {
      readonly status: 'error';
      readonly message: string;

      // What the server records and the model never reads. Only the tool puts a value here. A tool
      // never puts text here that a forget of another record must erase.
      readonly hidden?: JSONObject;

      // Set by a paid tool whose provider answered before the error, so the call was billed and a
      // paid call keeps its charges.
      readonly billed?: true;
    };

interface TypedResult {
  readonly result: JSONObject;
  readonly record?: JSONObject;
}

export interface DirectResult extends TypedResult {
  readonly images?: readonly ToolImage[];

  // Asks the model's loop to end its turn after this call, with no further model call. Only a tool
  // whose result ends the turn for good sets it.
  readonly endsTurn?: true;

  // The code of a refusal: the tool changed nothing, and the result says why. An approved action of
  // the call settles failed, with the code in its outcome.
  readonly refusalCode?: string;

  // Set by a paid tool whose provider billed the call before it refused, so the charge stands even
  // though the result carries a refusalCode.
  readonly billed?: true;

  // Sealed under the result record's key, in order, as the record's attachments. They never enter
  // the result's payload or its erasable text.
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];

  // Runs inside the write transaction of the result record, with that record's sequence, so what it
  // writes commits or rolls back with the record. A ToolResultRefusedError it throws rolls the
  // record back and writes an error result in its place.
  readonly writeBeside?: (tx: WriteTransaction, resultSequence: number) => Promise<void>;

  // What the server records and the model never reads. Only the tool puts a value here. A tool
  // never puts text here that a forget of another record must erase.
  readonly hidden?: JSONObject;
}

// Thrown by a result's writeBeside to refuse the write: the record rolls back, and the call's
// result becomes an error with this message.
export class ToolResultRefusedError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'ToolResultRefusedError';
  }
}

export interface ToolImage {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input: JsonSchema;

  readonly output: JsonSchema;
  readonly declaration: EffectDeclaration;
  readonly execution: ToolExecution;

  readonly run: (call: ToolCall, context: ToolContext) => Promise<ToolOutcome>;

  // A tool that costs money for each call, which is not a purchase. A call charges the price to the
  // budgets `<name>-day` and `<name>-month` before the provider sees it. A failure or a refusalCode
  // credits both, unless the outcome says the provider billed. The tool runs direct.
  readonly paid?: PaidTool;

  readonly recordInput?: (input: JSONObject) => JSONObject;

  // Reads what only the host can read about a call before the decision, such as a stored photo. It
  // returns the destinations the decision point checks in place of the declared ones, and effects it checks beside the declared ones,
  // or a result that ends the call. The action hash covers what it returns.
  readonly prepare?: (
    input: JSONObject,
    context: ToolResolveContext,
  ) => Promise<Prepared | DirectResult>;

  // Resolves the destinations of a call on the host, for a tool whose destinations are not plain
  // arguments, such as a reply that names a message. A tool without it takes each argument its
  // declaration names as a destination.
  readonly resolveDestinations?: (
    input: JSONObject,
    context: ToolResolveContext,
  ) => Promise<DestinationResolution>;

  // Resolves the time after which the call's action must not start, on the host, for a tool whose
  // provider limits when it may run. The model never supplies it. A tool without it has no deadline.
  readonly resolveDeadline?: (
    input: JSONObject,
    context: ToolResolveContext,
  ) => Promise<DeadlineResolution>;

  // Sets the call's policy sources and arguments on the host before the decision point runs, for a
  // tool whose sources depend on its input, such as a memory write that rests on a quote. A tool
  // without it takes the step's sources and its raw input.
  readonly resolvePolicyFacts?: (
    input: JSONObject,
    context: ToolResolveContext,
  ) => Promise<PolicyFactsResolution>;

  // Variants of the tool, each with a declaration of its own. A call to a tool with variants asks
  // the decision point about `<name>/<variant>`, under that variant's declaration, and every record
  // and cap still names the tool.
  readonly variants?: ToolVariants;
}

export interface Prepared {
  readonly destinations: readonly string[];

  // joins the effects in force for the tool for this call
  readonly effects?: readonly Effect[];

  // what the call costs in dollars, which stands in for the argument the declaration names as its
  // amount
  readonly amount?: number;

  // the URL the call expects its page to hold when its action runs; the action hash covers it
  readonly expectURL?: string;

  // the window the call expects to land on when its action runs; the action hash covers it
  readonly expectWindow?: JSONObject;

  // Sealed under the key of the call's own record, in order, when the call asks the owner, so a
  // card can show them. A forget of the record erases them.
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];

  // Runs once the call's record holds the attachments, with its sequence, so a tool can erase them
  // when what they show changed since it prepared them.
  readonly settleAttachments?: (callSequence: number) => Promise<void>;
}

export interface PaidTool {
  // The price of one call, in millionths of a dollar. A function prices the call from its input,
  // after check and before the charge.
  readonly priceMicros: number | ((input: JSONObject) => number | Promise<number>);

  // Refuses a call before anything is charged: a non-null result returns with no charge, and the
  // call cap does not count it.
  readonly check?: (input: JSONObject, context: PaidCallContext) => Promise<DirectResult | null>;

  // Runs when a call that passed check ends before the tool's run starts, such as at a budget that
  // is reached, so what check held for the call goes free. A call that runs frees its own hold.
  readonly release?: (context: PaidCallContext) => void;

  // a limit on the count of calls that the tool keeps beside its budgets, such as a daily cap
  readonly callCap?: PaidCallCap;
}

export interface PaidCallContext extends ToolResolveContext {
  // the call's own ID, which a hold that check takes is keyed by
  readonly callID: string;
}

export interface PaidCallCap {
  // Starts one call's check of the cap and its count, so both use the same moment, such as one
  // local day.
  readonly openCall: () => PaidCallCapCall;
}

// The 2 steps run in the write transaction that charges the budgets, so a call passes the cap and
// the budgets or neither. The count of a call is never credited.
export interface PaidCallCapCall {
  // reads whether the cap has room, and writes nothing
  readonly checkInTransaction: (tx: WriteTransaction) => Promise<CallCapCheck>;
  readonly countInTransaction: (tx: WriteTransaction) => Promise<void>;
}

export type CallCapCheck =
  | { readonly status: 'room' }
  | { readonly status: 'capped'; readonly message: string };

export interface ToolVariants {
  // the variant that a call whose input passed the tool's schema takes
  readonly pick: (input: unknown) => string;
  readonly declarations: Readonly<Record<string, EffectDeclaration>>;
}

// The sources and arguments that the decision point reads for a call, when the frame's sources and
// the model's raw input would misstate them.
export type PolicyFactsResolution =
  | {
      readonly status: 'ok';
      readonly sources: readonly RuleSource[];
      readonly args: JSONObject;
    }
  | { readonly status: 'error'; readonly message: string };

export type DeadlineResolution =
  | { readonly status: 'ok'; readonly deadlineAt: number | null }
  | { readonly status: 'error'; readonly message: string };

export type DestinationResolution =
  | { readonly status: 'ok'; readonly destinations: readonly CallDestination[] }
  | { readonly status: 'error'; readonly message: string };

export type SchemaCheck =
  | { readonly isValid: true }
  | { readonly isValid: false; readonly errors: string };

export interface RegisteredTool {
  readonly definition: ToolDefinition;
  readonly parseInput: (value: unknown) => SchemaCheck;
  readonly parseOutput: (value: unknown) => SchemaCheck;
}

export interface ToolRegistry {
  // the name of each registered tool, which a source's tools join at each read
  readonly toolNames: readonly string[];
  readonly findTool: (name: string) => RegisteredTool | null;
}

// A second source of tool definitions, which the composition root passes in. The MCP proxy provides
// one, whose tools come and go as servers list them.
export interface ToolSource {
  // the exposed, stopped and held tools, read at each call
  readonly toolNames: () => readonly string[];

  // Built from the tool's current pin, and cached for its hash. A definition that fails the
  // registry's checks is not served.
  readonly findTool: (name: string) => RegisteredTool | null;
}

export interface ToolRun {
  readonly runID: string;

  readonly thread: string;

  // the thread of log.read, log.read_image and a cited message; nothing stores it
  readonly logThread: string;

  readonly tools: readonly string[];

  readonly model: ToolRunModel;

  // set by nixie from the task's definition, never from a tool's input: the run may write the
  // assistant's self-notes
  readonly hasSelfNoteGrant?: boolean;

  // the self-note tools that only the grant gives this run, because its definition's list leaves
  // them out: they write self-notes and nothing else
  readonly selfNoteOnlyTools?: readonly string[];

  readonly stepRunID?: string;

  // the open task run, with the caps of its limits; a started task passes none
  readonly taskRun?: {
    readonly runID: string;
    readonly calls: Readonly<Record<string, number>>;
  };

  // the conversation session the step's turn runs on; absent for a call under the run's own token
  readonly session?: ToolSession;
}

// A conversation session as a tool call sees it: its random key, which a store that lasts a session
// keys its rows by, and the newest session invalidation the step saw, so a write can refuse once a
// forget ended the session.
export interface ToolSession {
  readonly key: string;
  readonly invalidatedThrough: number;

  // The SDK repeats every image a session took in each later request, so an image a tool returns
  // counts against the session's image budget, and false refuses it.
  readonly reserveImages?: (images: readonly ToolImage[]) => boolean;

  // what the session's image caps still take, counted in base64 bytes and in images, so a tool
  // that draws can refuse before it pays for a picture the model could not see
  readonly readImageRoom?: () => ImageRoom;

  // Takes room for one image at the largest size under the key of a call, so calls that run side
  // by side cannot all pass on the same room. False means the caps have none. A key that holds
  // already stays held.
  readonly holdImageRoom?: (key: string) => boolean;

  // Frees what the key holds, once: a second release of the same key frees nothing. The call
  // frees its hold before it reserves the picture it got.
  readonly releaseImageRoom?: (key: string) => void;

  // A turn that holds a message from the owner refuses to end with nothing sent, so the model
  // replies to it.
  readonly endSilently?: () => SilentEnd;

  // what the step's calls pass to the decision point beyond the tool and its input
  readonly policy?: StepPolicyFrame;

  // what a call that starts more model work needs from the turn that makes it; a worker's own step
  // token never gives it
  readonly step?: ToolStepHold;
}

export interface ImageRoom {
  readonly bytes: number;
  readonly count: number;
}

export interface ToolStepHold {
  // the step lost its lease or was ended: the call returns nothing
  readonly signal: AbortSignal;

  // the turn was interrupted or reached its budget: the call stops and answers
  readonly interrupt: AbortSignal;

  // null for a caller with no dollar limit
  readonly readLeftDollars: () => number | null;

  // lowers what is left of the calling turn's budget
  readonly onSpend: (dollars: number) => void;
}

export interface StepPolicyFrame {
  readonly context: RuleContext;
  readonly definitionID: string | null;

  // the owner message that started the turn; null in a task run
  readonly turnMessageSequence: number | null;

  // owner messages that a task message carried to the task
  readonly onBehalfOf: readonly number[];
  readonly sources: readonly RuleSource[];
}

export type SilentEnd = 'ended' | 'refused';

export interface ToolRunModel {
  readonly model: string;
  readonly profile: string;
}

export interface QueuedAction {
  readonly call: ToolCall;
  readonly run: ToolRun;

  readonly decision: Decision;

  readonly callSequence: number;

  // the hash of the operation the policy checked: tool, input, destinations and deadline
  readonly actionHash: string;
  readonly deadlineAt: number | null;

  // the effects the tool declares, which the owner reads in a question about the action
  readonly effects: readonly Effect[];

  // what the hash covers and the owner's question shows, for the proposal of a call that cannot
  // queue
  readonly destinations?: readonly CallDestination[];
  readonly content?: readonly string[];
}

// What the queue did with an allowed call: it queued an action, or it asked the owner instead.
export type Enqueued =
  | { readonly status: 'queued'; readonly actionID: string }
  | { readonly status: 'asked'; readonly shortID: string };

export type ActionOutcome =
  | {
      readonly outcome: 'done';
      readonly result: JSONObject;

      // the pictures the connector's result carried
      readonly images?: readonly ToolImage[];
    }
  | {
      readonly outcome: 'failed' | 'unknown' | 'cancelled';
      readonly reason: string;
    };

export interface RepeatQuery {
  readonly run: ToolRun;
  readonly tool: string;
  readonly input: JSONObject;
  readonly actionHash: string;
}

// The earlier approved action of the same call that no run has settled.
export interface OpenRepeat {
  readonly actionID: string;

  // whether the task's step runs it, so it settles in no turn that repeats the call
  readonly runsInStep: boolean;
}

export type OpenAsk =
  | { readonly kind: 'action'; readonly repeat: OpenRepeat }
  | { readonly kind: 'proposal'; readonly shortID: string };

export interface ActionQueue {
  readonly enqueue: (action: QueuedAction) => Promise<Enqueued>;

  // the pending or unknown action that the same call already queued, or null
  readonly readOpenRepeat: (query: RepeatQuery) => Promise<OpenRepeat | null>;

  // What the same call already has open, or null: an approved action no run has settled, or the
  // proposal that asks the owner about it. It reads in the transaction that would write a second
  // proposal, so no call proposes beside an approval it has not used.
  readonly readOpenAsk: (tx: WriteTransaction, query: RepeatQuery) => Promise<OpenAsk | null>;

  readonly waitForOutcome: (actionID: string, timeoutMs: number) => Promise<ActionOutcome | null>;
}

export interface RunEndpoint {
  readonly runID: string;
  readonly token: string;

  readonly startStep: (
    stepRunID: string,
    session?: ToolSession,
    taskRun?: NonNullable<ToolRun['taskRun']>,
  ) => StepToken;

  // Runs the call the owner approved, with the tool run of the step that the token belongs to, so
  // the call has the step's session, its hold on the turn's budget and its task run's bounds. A
  // token of a step that has stopped refuses.
  readonly runApproved: (token: string, request: ApprovedCallRequest) => Promise<ApprovedRun>;

  readonly socketPath: string;
  readonly target: ToolTarget;

  readonly stop: () => Promise<void>;
}

interface StepToken {
  readonly token: string;

  readonly stop: () => Promise<void>;
}

// A run whose calls a guest's MCP client sends.
export interface GuestToolRun extends ToolRun {
  // the MCP _meta key that carries the model's tool-use ID on each call, or null when the guest
  // sends none
  readonly toolUseMetaKey: string | null;

  // the sequence that each tool_called of this tool run takes as its parent
  readonly parent?: number;
}

export interface ToolEndpoint {
  readonly startRun: (run: GuestToolRun) => Promise<RunEndpoint>;

  readonly getToolTarget: (sandbox: SandboxRef) => ToolTarget;
  readonly stop: () => Promise<void>;
}

export type ResultSources = Readonly<Record<string, ContentSource>>;
