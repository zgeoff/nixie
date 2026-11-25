import type { JSONObject, RecordInput } from '@heynixie/log';
import type { TaskControl } from '@heynixie/task-control';
import type { JsonSchema, ToolDefinition } from '@heynixie/tools';
import type { Transaction } from 'kysely';
import type { z } from 'zod';
import type { RunMeterName } from '../run/types';
import type { TaskStarter } from '../task/start/plan-task-start';
import type { RunStep, TaskLimits, TaskReport, TaskStartBounds, TasksContext } from '../types';

export type StartDeclaration = ToolDefinition['declaration'];

// What every start input holds, whatever runner it picks.
export interface TaskStartEnvelope {
  readonly runner?: string | undefined;
  readonly name: string;
  readonly brief: string;
  readonly report?: TaskReport | undefined;
  readonly disposable?: boolean | undefined;
  readonly limits?:
    | { readonly turns?: number | undefined; readonly dollars?: number | undefined }
    | undefined;
}

// An action that a runner or a tool queues on a task's thread, such as a spawn. The attempt meets
// the decision point as every action's attempt does, with the task that owns the thread as its
// caller. The actions module builds the queue that takes it.
export interface RunnerAction {
  // a connector tool that no model's tool list holds, such as 'coding.spawn'
  readonly tool: string;

  // erasable, as every action's arguments are
  readonly args: JSONObject;

  // the action hash: a step that runs again with the same parts queues nothing
  readonly hashParts: readonly string[];

  readonly causedBy:
    | { readonly kind: 'tool_call'; readonly callID: string }
    | { readonly kind: 'record'; readonly sequence: number };
}

// A runner's own part of its start's transaction. A join uses it to bind its session, which needs
// the new task's ID and a check that no open task binds the session already.
export interface StartTransaction {
  // a sentence that refuses the start, or null; runs before the task is written
  readonly check: (tx: Transaction<unknown>) => Promise<string | null>;

  // runs after the task is written
  readonly write: (tx: Transaction<unknown>, taskID: string) => Promise<void>;
}

export type RunnerStartPlan<Options> =
  | {
      readonly status: 'planned';
      readonly envelope: { readonly report: TaskReport; readonly limits: TaskLimits };
      readonly options: Options;

      // what the start queues on the new task's thread: [] for the sandbox runner and for a join
      readonly actions: readonly RunnerAction[];
      readonly transaction?: StartTransaction;
    }
  | { readonly status: 'refused'; readonly sentence: string };

// One variant of the start tool's input, with its own typed input and options.
export interface RunnerStart<Input extends TaskStartEnvelope, Options> {
  // a strict object; `runner` is optional only on the default runner's variant
  readonly schema: z.ZodType<Input>;
  readonly describeInput: (bounds: TaskStartBounds) => JsonSchema;

  // the declaration of `task.start/<key>`
  readonly declaration: StartDeclaration;
  readonly plan: (
    start: Input,
    starter: TaskStarter,
    bounds: TaskStartBounds,
  ) => Promise<RunnerStartPlan<Options>>;

  // true: the start writes the built options; false: it writes the envelope and the runner's options
  readonly storesBuiltOptions: boolean;
  readonly encodeOptions: (options: Options) => JSONObject;
}

// A variant with its typed input and options erased, as the registry holds it.
export interface RunnerStartPort {
  readonly schema: z.ZodType<TaskStartEnvelope>;
  readonly describeInput: (bounds: TaskStartBounds) => JsonSchema;
  readonly declaration: StartDeclaration;
  readonly storesBuiltOptions: boolean;

  // parses the input, plans the start and encodes its options
  readonly plan: (
    input: unknown,
    starter: TaskStarter,
    bounds: TaskStartBounds,
  ) => Promise<RunnerStartPlan<JSONObject>>;
}

export interface TaskRunnerDefinition {
  // the `runner` value of a start and of a stored task
  readonly key: string;
  readonly controls: readonly TaskControl[];

  // null: no start can pick the runner
  readonly start: RunnerStartPort | null;
  readonly fixedTasks: readonly string[];

  // the restart sweep keeps the sandboxes that the runner's open tasks own
  readonly keepsSandboxes: boolean;

  // the meters that limit this runner's task runs; the sandbox runner and each fixed-task runner
  // list both
  readonly meters: readonly RunMeterName[];

  // called after a stop, a close or a failure commits; null: nothing to do
  readonly ended:
    | ((context: RunnerEndContext, taskID: string, cause: RunnerEndCause) => Promise<void>)
    | null;

  // the fields that tasks.list adds to each listed task of this runner; null: none
  readonly listFields:
    | ((
        context: Pick<TasksContext, 'log'>,
        taskIDs: readonly string[],
      ) => Promise<ReadonlyMap<string, JSONObject>>)
    | null;
}

export type RunnerEndCause = 'stopped' | 'closed' | 'failed';

// What `ended` gets. It runs outside any step, as the task no longer steps.
export interface RunnerEndContext extends Pick<TasksContext, 'log' | 'clock' | 'definitions'> {
  // writes the records and queues the actions on the task's thread, in one transaction
  readonly commit: (input: RunnerEndCommit) => Promise<void>;
}

export interface RunnerEndCommit {
  readonly records: readonly RecordInput[];
  readonly actions: readonly RunnerAction[];
}

export interface StartableRunner extends TaskRunnerDefinition {
  readonly start: RunnerStartPort;
}

export type TaskRunnerResolution =
  | { readonly status: 'found'; readonly definition: TaskRunnerDefinition }

  // the task's stored `runner` names no definition
  | { readonly status: 'unknown'; readonly key: string }

  // no definition runs the task
  | { readonly status: 'none' };

export interface BoundStep {
  readonly definition: TaskRunnerDefinition;
  readonly runStep: RunStep;
}

export interface TaskRunnerRegistry {
  // the definitions with a start, in list order
  readonly startable: readonly StartableRunner[];

  // runs a started task whose record names no runner
  readonly defaultRunner: TaskRunnerDefinition;

  readonly resolve: (
    context: Pick<TasksContext, 'log'>,
    taskID: string,
  ) => Promise<TaskRunnerResolution>;

  // the tasks whose sandboxes the restart sweep keeps: the fixed tasks of each runner that keeps sandboxes,
  // and each open started task that resolves to one
  readonly readKeptSandboxOwners: (
    context: Pick<TasksContext, 'log'>,
  ) => Promise<readonly string[]>;

  // one step that runs each task on its runner's step, and on the fallback when no runner owns the
  // task
  readonly bindSteps: (
    context: Pick<TasksContext, 'log'>,
    bound: readonly BoundStep[],
    fallback: RunStep,
  ) => RunStep;
}
