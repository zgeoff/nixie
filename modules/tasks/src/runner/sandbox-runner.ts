import { taskControls } from '@heynixie/task-control';
import { encodeTaskRunOptions } from '../limit/encode-task-run-options';
import { planTaskStart } from '../task/start/plan-task-start';
import type { TaskStarter } from '../task/start/plan-task-start';
import { renderChoiceRefusal } from '../task/start/render-choice-refusal';
import type { TaskRunOptions, TaskStartBounds } from '../types';
import { buildSandboxStartInput } from './build-sandbox-start-input';
import { defineRunnerStart } from './define-runner-start';
import { sandboxStartSchema } from './sandbox-start-schema';
import type { SandboxStartInput } from './sandbox-start-schema';
import type { RunnerStartPlan, StartDeclaration, TaskRunnerDefinition } from './types';

const sandboxStartDeclaration: StartDeclaration = {
  effects: ['note'],
  destinations: [],
  amount: null,
  content: ['name', 'brief'],
  results: { taskID: 'owner_data', name: 'owner_data', note: 'owner_data' },
};

// The runner that runs a model in a sandbox. It runs every started task whose record names no
// runner.
export const sandboxRunner: TaskRunnerDefinition = {
  key: 'sandbox',
  controls: taskControls,
  start: defineRunnerStart({
    schema: sandboxStartSchema,
    describeInput: buildSandboxStartInput,
    declaration: sandboxStartDeclaration,
    storesBuiltOptions: true,
    plan: (start, starter, bounds) => Promise.resolve(planSandboxStart(start, starter, bounds)),
    encodeOptions: encodeTaskRunOptions,
  }),
  fixedTasks: [],
  keepsSandboxes: true,
  meters: ['turns', 'dollars'],
  ended: null,
  listFields: null,
};

// The sandbox runner's plan, which reads nothing, so a check of a definition's start calls it
// without waiting.
export function planSandboxStart(
  start: SandboxStartInput,
  starter: TaskStarter,
  bounds: TaskStartBounds,
): RunnerStartPlan<TaskRunOptions> {
  const plan = planTaskStart(start, starter, bounds);

  if (plan.status === 'refused') {
    return { status: 'refused', sentence: renderChoiceRefusal(plan.refusal) };
  }

  return {
    status: 'planned',
    envelope: { report: plan.options.report, limits: plan.options.limits },
    options: plan.options,
    actions: [],
  };
}
