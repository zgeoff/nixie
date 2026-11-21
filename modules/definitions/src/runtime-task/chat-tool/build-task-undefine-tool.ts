import { parseJSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { requestDefinitionChange } from '../request-definition-change';
import type { ChatToolOptions } from './chat-tool-options';
import { notReadyMessage } from './chat-tool-options';
import { taskUndefineInputSchema } from './task-define-input-schema';

const jsonSchema = z.toJSONSchema(taskUndefineInputSchema, {
  io: 'input',
  target: 'draft-2020-12',
});

const inputSchema = z.record(z.string(), z.json()).parse(structuredClone(jsonSchema));

// Held by the conversation alone: the tool stays out of every task's list.
export function buildTaskUndefineTool(options: ChatToolOptions): ToolDefinition {
  return {
    name: 'task.undefine',
    description:
      'Removes a task definition. It takes effect at once, and the owner sees a notice with an ' +
      'undo. A refusal comes back as `refused` with a code.',
    input: inputSchema,
    output: {
      type: 'object',
      properties: {
        definitionID: { type: 'string' },
        changeID: { type: 'string', description: 'the ID of the change' },
        refused: { type: 'object', description: 'the code of the refusal and its payload' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['schedule'],
      destinations: [],
      amount: null,
      content: [],
      results: { definitionID: 'owner_data', changeID: 'owner_data', refused: 'owner_data' },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = taskUndefineInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const context = options.readDefinitions();

      if (context === null) {
        return { status: 'error', message: notReadyMessage };
      }

      const result = await requestDefinitionChange(context, {
        kind: 'undefine',
        definitionID: parsed.data.definitionID,
      });

      if (result.status === 'refused') {
        return {
          status: 'ok',
          result: { refused: parseJSONObject(JSON.stringify(result.refusal)) },
          refusalCode: result.refusal.code,
        };
      }

      return {
        status: 'ok',
        result: { definitionID: result.definitionID, changeID: result.shortID },
      };
    },
  };
}
