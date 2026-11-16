import { taskControls } from '@heynixie/task-control';
import { taskRunOptionsSchema } from '../limit/task-run-options-schema';
import { planTaskStart } from '../task/start/plan-task-start';
import { renderChoiceRefusal } from '../task/start/render-choice-refusal';
import { buildSandboxStartInput } from './build-sandbox-start-input';
import { defineRunnerStart } from './define-runner-start';
import { sandboxStartSchema } from './sandbox-start-schema';
import type { StartDeclaration, TaskRunnerDefinition } from './types';

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
    plan: (start, starter, bounds) => {
      const plan = planTaskStart(start, starter, bounds);

      if (plan.status === 'refused') {
        return { status: 'refused', sentence: renderChoiceRefusal(plan.refusal) };
      }

      return {
        status: 'planned',
        envelope: { report: plan.options.report, limits: plan.options.limits },
        options: plan.options,
      };
    },
    encodeOptions: (options) => taskRunOptionsSchema.parse(options),
  }),
  fixedTasks: [],
  keepsSandboxes: true,
};
