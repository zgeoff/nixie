import type { JSONObject } from '@heynixie/log';
import { reportShapeKeywords } from '../report/check-report-shape';
import type { TaskStartBounds } from '../types';
import { buildModelChoiceSchema } from './build-model-choice-schema';

export function buildSandboxStartInput(bounds: TaskStartBounds): JSONObject {
  const limits = bounds.limits;

  const model = buildModelChoiceSchema(
    bounds.models,
    'The model the task runs on; leave it out for the usual one.',
  );

  return {
    type: 'object',
    properties: {
      runner: { type: 'string', const: 'sandbox' },
      name: { type: 'string', minLength: 1, maxLength: 80 },
      brief: { type: 'string', minLength: 1, maxLength: 8000 },
      ...(model === null ? {} : { model }),
      persona: {
        type: 'string',
        enum: ['default', 'none'],
        description: 'default speaks as you; none gives the task no persona',
      },
      memory: {
        type: 'string',
        enum: ['none', 'read'],
        description:
          'read gives the task your pinned memory, recall and the memory read tools; none ' +
          'gives it none of them',
      },
      log: {
        type: 'string',
        enum: ['own', 'conversation'],
        description:
          "conversation lets the task read the conversation's log with log.read and " +
          'log.read_image; own, the default, gives it only its own',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
        maxItems: 50,
        description:
          'the names of tools you hold that the task may use, as your tool list shows them, such ' +
          'as mcp__nixie__memory_recall, or as nixie names them, such as memory.recall',
      },
      report: {
        type: 'string',
        enum: ['wake', 'next_turn', 'none'],
        description:
          'how the result reaches you: wake wakes you, next_turn waits for your next turn, ' +
          'none sends no report',
      },
      reportShape: {
        type: 'object',
        properties: {
          properties: {
            type: 'object',
            description: `the fields your report must hold, by name, each a schema that takes only ${reportShapeKeywords.join(', ')}`,
          },
          required: { type: 'array', items: { type: 'string' } },
        },
        required: ['properties'],
        additionalProperties: false,
        description:
          'the fields the task must pass with its report, beside its summary; nixie checks that ' +
          'they match this shape and never that they are true',
      },
      disposable: {
        type: 'boolean',
        description:
          'true unless you set it: a disposable task closes once it reports and takes no more ' +
          'messages. Set it to false for a task you will message again with more work, and ' +
          'close that task with task.close when you no longer need it',
      },
      limits: {
        type: 'object',
        properties: {
          turns: { type: 'integer', minimum: 1 },
          dollars: { type: 'number', exclusiveMinimum: 0 },
        },
        additionalProperties: false,
        description: `the task's turns and model cost in dollars; ${String(limits.default.turns)} turns and $${String(limits.default.dollars)} unless you set them, and at most ${String(limits.max.turns)} turns and $${String(limits.max.dollars)}`,
      },
    },
    required: ['name', 'brief'],
    additionalProperties: false,
  };
}
