import { taskControls } from '@heynixie/task-control';
import { z } from 'zod';
import { taskRunOptionsSchema } from '../limit/task-run-options-schema';
import { planTaskStart } from '../task/start/plan-task-start';
import { renderChoiceRefusal } from '../task/start/render-choice-refusal';
import { buildSandboxStartInput } from './build-sandbox-start-input';
import { defineRunnerStart } from './define-runner-start';
import type { StartDeclaration, TaskRunnerDefinition } from './types';

const sandboxStartSchema = z.strictObject({
  runner: z.literal('sandbox').optional(),
  name: z.string(),
  brief: z.string(),
  model: z.string().optional(),
  persona: z.enum(['default', 'none']).optional(),
  memory: z.enum(['none', 'read']).optional(),
  tools: z.string().array().optional(),
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
  reportShape: z.unknown().optional(),
  disposable: z.boolean().optional(),
  limits: z
    .object({ turns: z.int().positive().optional(), dollars: z.number().positive().optional() })
    .optional(),
});

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
