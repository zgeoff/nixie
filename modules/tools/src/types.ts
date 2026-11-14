import type { ContentSource, Decision, JSONObject } from '@heynixie/log';
import type { CallDestination, EffectDeclaration, RuleContext, RuleSource } from '@heynixie/policy';
import type { SandboxRef, ToolTarget } from '@heynixie/sandbox';

export type JsonSchema = JSONObject;

export type ToolExecution = 'direct' | 'queued';

export interface ToolCall {
  readonly callID: string;
  readonly tool: string;
  readonly input: JSONObject;

  readonly toolUseID: string | null;
}

export interface ToolContext {
  readonly run: ToolRun;
}

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

  // What the server records and the model never reads. Only the tool puts a value here. A tool
  // never puts text here that a forget of another record must erase.
  readonly hidden?: JSONObject;
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
    context: ToolContext,
  ) => Promise<DestinationResolution>;
}

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

  readonly tools: readonly string[];

  readonly model: ToolRunModel;

  readonly stepRunID?: string;

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
}

export type ActionOutcome =
  | { readonly outcome: 'done'; readonly result: JSONObject }
  | { readonly outcome: 'failed' | 'unknown' | 'cancelled'; readonly reason: string };

export interface ActionQueue {
  readonly enqueue: (action: QueuedAction) => Promise<string>;

  readonly waitForOutcome: (actionID: string, timeoutMs: number) => Promise<ActionOutcome | null>;
}

export interface RunEndpoint {
  readonly runID: string;
  readonly token: string;

  readonly startStep: (stepRunID: string, session?: ToolSession) => StepToken;

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
}

export interface ToolEndpoint {
  readonly startRun: (run: GuestToolRun) => Promise<RunEndpoint>;

  readonly getToolTarget: (sandbox: SandboxRef) => ToolTarget;
  readonly stop: () => Promise<void>;
}

export type ResultSources = Readonly<Record<string, ContentSource>>;
