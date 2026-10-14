import type { ContentSource, Decision, JSONObject } from '@heynixie/log';
import type { EffectDeclaration } from '@heynixie/policy';
import type { SandboxRef, ToolTarget } from '@heynixie/sandbox';

// A JSON Schema for an object, such as a tool's input or its typed result.
export type JsonSchema = JSONObject;

// How a tool runs: direct in the turn, or queued as an action with an ID and an outcome.
export type ToolExecution = 'direct' | 'queued';

// One tool call as a tool receives it.
export interface ToolCall {
  // random per call; the call's records and its action carry it
  readonly callID: string;
  readonly tool: string;
  readonly input: JSONObject;

  // the model's tool-use ID from _meta claudecode/toolUseId, or null when the client sent none
  readonly toolUseID: string | null;
}

export interface ToolContext {
  readonly run: ToolRun;
}

// A typed result, or an error the model reads as the tool's refusal.
export type ToolOutcome =
  | ({ readonly status: 'ok' } & TypedResult)
  | { readonly status: 'error'; readonly message: string };

// A result the output schema checks. A result that repeats text another key guards, such as a
// memory item's, gives a record that holds references in its place, so removing that key leaves no
// readable copy in the result's record.
export interface TypedResult {
  readonly result: JSONObject;
  readonly record?: JSONObject;
}

// A tool as connectors, the MCP proxy and nixie's own features define it. The model sees the name,
// the description and the input schema; the output schema and the declaration stay in the registry.
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input: JsonSchema;

  // the typed result, an object whose every top-level field has a source in the declaration
  readonly output: JsonSchema;
  readonly declaration: EffectDeclaration;
  readonly execution: ToolExecution;

  // receives an input the input schema accepted, and returns a result the output schema checks
  readonly run: (call: ToolCall, context: ToolContext) => Promise<ToolOutcome>;

  // what the call's record holds of the input, when the input repeats text another key guards. It
  // receives the input as the model sent it, before any schema check. The record holds the whole
  // input when this is absent.
  readonly recordInput?: (input: JSONObject) => JSONObject;
}

// The result of checking a value against a schema.
export type SchemaCheck =
  | { readonly isValid: true }
  | { readonly isValid: false; readonly errors: string };

// A tool in the registry, with its schemas compiled.
export interface RegisteredTool {
  readonly definition: ToolDefinition;
  readonly parseInput: (value: unknown) => SchemaCheck;
  readonly parseOutput: (value: unknown) => SchemaCheck;
}

export interface ToolRegistry {
  readonly findTool: (name: string) => RegisteredTool | null;
}

// A task run or a worker run that the endpoint serves.
export interface ToolRun {
  // the run's ID, which is also the owner of the run's sandbox
  readonly runID: string;

  // the conversation or the task the run's records belong to
  readonly thread: string;

  // the caller's tool list: the job's list for a job run, the conversation's list for the
  // conversation, and the subset the caller passed for a worker
  readonly tools: readonly string[];

  // the model profile in force for the run's model loop, which every call's record carries
  readonly model: ToolRunModel;

  // the run identity of the step whose step token the call arrived with, which the action queue
  // checks against the task's current claim; absent for a call under the run's own token
  readonly stepRunID?: string;
}

// The model ID and the profile name of a run, set from the profile nixie started the run with and
// never from anything the model sends.
export interface ToolRunModel {
  readonly model: string;
  readonly profile: string;
}

// An allowed queued call, as the endpoint hands it to the action queue.
export interface QueuedAction {
  readonly call: ToolCall;
  readonly run: ToolRun;

  // the decision that allowed the call, which the action's record carries too
  readonly decision: Decision;

  // the sequence of the call's record, which holds the decision that allowed it
  readonly callSequence: number;
}

// The outcome of a queued action once it settles.
export type ActionOutcome =
  | { readonly outcome: 'done'; readonly result: JSONObject }
  | { readonly outcome: 'failed' | 'unknown'; readonly reason: string };

// The action queue the endpoint hands allowed queued calls to, which the actions module implements.
export interface ActionQueue {
  // queues the call and returns its action ID, which is also the proposal ID, the queue key and the
  // idempotency key; a call that repeats an earlier action returns that action's ID
  readonly enqueue: (action: QueuedAction) => Promise<string>;

  // the action's outcome once it settles, or null when it is still pending after timeoutMs
  readonly waitForOutcome: (actionID: string, timeoutMs: number) => Promise<ActionOutcome | null>;
}

// A run's endpoint: the token the run's guest sends as its bearer token, and the target that the
// sandbox adapter's route delivers each of the guest's connections to.
export interface RunEndpoint {
  readonly runID: string;
  readonly token: string;

  // issues a token of the step's own, so each call that arrives with it carries the step's run
  // identity; the run's stop revokes it too
  readonly startStep: (stepRunID: string) => StepToken;

  // the Unix socket the run's endpoint listens on, which target names
  readonly socketPath: string;
  readonly target: ToolTarget;

  // revokes the token, closes every open stream and stops listening
  readonly stop: () => Promise<void>;
}

// One step's bearer token on its run's endpoint.
interface StepToken {
  readonly token: string;

  // revokes the token and closes every stream opened with it
  readonly stop: () => Promise<void>;
}

export interface ToolEndpoint {
  readonly startRun: (run: ToolRun) => Promise<RunEndpoint>;

  // the target for a sandbox's run, a ToolTargetResolver for the sandbox adapter. A sandbox whose
  // run has no endpoint gets a target where nothing listens, so its connections fail.
  readonly getToolTarget: (sandbox: SandboxRef) => ToolTarget;
  readonly stop: () => Promise<void>;
}

// The source of content of each field of a result, which the result's record carries.
export type ResultSources = Readonly<Record<string, ContentSource>>;
