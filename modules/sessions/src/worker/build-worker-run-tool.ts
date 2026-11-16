import type { WorkerRunLimits } from '@heynixie/models';
import type { TaskStartBounds } from '@heynixie/tasks';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { WorkerRunFacts } from './plan-worker-run';
import { planWorkerRun } from './plan-worker-run';
import { runWorker } from './run-worker';
import type { WorkerDeps } from './types';
import { workerRunToolName } from './worker-run-tool-name';

export interface WorkerRunToolOptions {
  readonly deps: WorkerDeps;
  readonly bounds: WorkerRunFacts['bounds'] & Pick<TaskStartBounds, 'memoryTools'>;
  readonly limits: WorkerRunLimits;

  // false once the worker stopped
  readonly isRunning: () => boolean;
}

const inputSchema = z.object({
  question: z.string(),
  tools: z.string().array().exactOptional(),
});

export function buildWorkerRunTool(options: WorkerRunToolOptions): ToolDefinition {
  return {
    name: workerRunToolName,
    description:
      'Runs a worker: one model call loop in a sandbox of its own, for one question, and returns its ' +
      'answer. The worker holds only the tools you name from the tools you hold, and none that ' +
      'start tasks, send messages or touch memory. It has no history, so put everything it needs in ' +
      'the question. The call waits for the answer, and it stops at its limits of minutes, turns, ' +
      'tokens and dollars. Its spend counts toward this task.',
    input: {
      type: 'object',
      properties: {
        question: { type: 'string', minLength: 1, maxLength: 8000 },
        tools: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 50,
          uniqueItems: true,
        },
      },
      required: ['question'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        workerRunID: { type: 'string' },
        answer: { type: 'string' },
        used: {
          type: 'object',
          properties: {
            minutes: { type: 'number' },
            turns: { type: 'integer' },
            tokens: { type: 'integer' },
            dollars: { type: 'number' },
          },
          required: ['minutes', 'turns', 'tokens', 'dollars'],
          additionalProperties: false,
        },
      },
      required: ['workerRunID', 'answer', 'used'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['question'],
      results: { workerRunID: 'owner_data', answer: 'untrusted', used: 'owner_data' },
    },
    execution: 'direct',
    run: async (call, tool): Promise<ToolOutcome> => {
      const input = inputSchema.parse(call.input);

      const planned = planWorkerRun({
        call: {
          callID: call.callID,
          callSequence: tool.callSequence,
          question: input.question,
          tools: input.tools ?? [],
        },
        run: tool.run,
        isRunning: options.isRunning(),
        bounds: options.bounds,
        limits: options.limits,
        now: options.deps.clock.now(),
      });

      if (planned.status === 'refused') {
        return { status: 'error', message: planned.sentence };
      }

      const result = await runWorker(options.deps, planned.plan);

      return result.kind === 'answered'
        ? {
            status: 'ok',
            result: { workerRunID: result.shortID, answer: result.answer, used: result.used },
          }
        : { status: 'error', message: result.sentence };
    },
  };
}
