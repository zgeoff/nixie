import type { ContentSource, Decision, JSONObject, WriteTransaction } from '@heynixie/log';
import type {
  AllowingRule,
  CallDestination,
  EffectDeclaration,
  RuleContext,
  RuleSource,
} from '@heynixie/policy';
import type { SandboxRef, ToolTarget } from '@heynixie/sandbox';

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
    };

interface TypedResult {
  readonly result: JSONObject;
  readonly record?: JSONObject;
}

export interface DirectResult extends TypedResult {
  readonly images?: readonly ToolImage[];

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

  readonly recordInput?: (input: JSONObject) => JSONObject;

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
  readonly findTool: (name: string) => RegisteredTool | null;
}

export interface ToolRun {
  readonly runID: string;

  readonly thread: string;

  // the thread of log.read, log.read_image and a cited message; nothing stores it
  readonly logThread: string;

  readonly tools: readonly string[];

  readonly model: ToolRunModel;

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

  // A turn that holds a message from the owner refuses to end with nothing sent, so the model
  // replies to it.
  readonly endSilently?: () => SilentEnd;

  // what the step's calls pass to the decision point beyond the tool and its input
  readonly policy?: StepPolicyFrame;

  // what a call that starts more model work needs from the turn that makes it; a worker's own step
  // token never gives it
  readonly step?: ToolStepHold;
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
  readonly effects: readonly string[];
}

export type ActionOutcome =
  | { readonly outcome: 'done'; readonly result: JSONObject }
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

export interface ActionQueue {
  readonly enqueue: (action: QueuedAction) => Promise<string>;

  // the ID of the pending or unknown action that the same call already queued, or null
  readonly readOpenRepeat: (query: RepeatQuery) => Promise<string | null>;

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
