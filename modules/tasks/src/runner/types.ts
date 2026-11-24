import type { JSONObject } from '@heynixie/log';
import type { TaskControl } from '@heynixie/task-control';
import type { JsonSchema, ToolDefinition } from '@heynixie/tools';
import type { z } from 'zod';
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

export type RunnerStartPlan<Options> =
  | {
      readonly status: 'planned';
      readonly envelope: { readonly report: TaskReport; readonly limits: TaskLimits };
      readonly options: Options;
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
  ) => RunnerStartPlan<Options>;

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
  ) => RunnerStartPlan<JSONObject>;
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
