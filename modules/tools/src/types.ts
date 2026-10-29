import type { ContentSource, Decision, JSONObject } from '@heynixie/log';
import type { EffectDeclaration } from '@heynixie/policy';
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
  | { readonly status: 'error'; readonly message: string };

interface TypedResult {
  readonly result: JSONObject;
  readonly record?: JSONObject;
}

export interface DirectResult extends TypedResult {
  readonly images?: readonly ToolImage[];
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
}

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
}

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
  | { readonly outcome: 'failed' | 'unknown'; readonly reason: string };

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

export interface ToolEndpoint {
  readonly startRun: (run: ToolRun) => Promise<RunEndpoint>;

  readonly getToolTarget: (sandbox: SandboxRef) => ToolTarget;
  readonly stop: () => Promise<void>;
}

export type ResultSources = Readonly<Record<string, ContentSource>>;
