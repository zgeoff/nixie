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
  | ({ readonly status: 'ok' } & TypedResult)
  | { readonly status: 'error'; readonly message: string };

export interface TypedResult {
  readonly result: JSONObject;
  readonly record?: JSONObject;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input: JsonSchema;

  readonly output: JsonSchema;
  readonly declaration: EffectDeclaration;
  readonly execution: ToolExecution;

  readonly run: (call: ToolCall, context: ToolContext) => Promise<ToolOutcome>;

  // This receives the input as the model sent it, before any schema check.
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
  // The action ID is also the proposal ID, the queue key and the idempotency key, and a call that
  // repeats an earlier action gets that action's ID.
  readonly enqueue: (action: QueuedAction) => Promise<string>;

  readonly waitForOutcome: (actionID: string, timeoutMs: number) => Promise<ActionOutcome | null>;
}

export interface RunEndpoint {
  readonly runID: string;
  readonly token: string;

  readonly startStep: (stepRunID: string) => StepToken;

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
