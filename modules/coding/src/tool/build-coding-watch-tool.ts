import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { codingDeclarations } from '../connector/coding-declarations';
import { codingToolNames } from '../connector/coding-tool-names';
import { codingWakeSetCodec } from '../record/coding-wake-set-codec';
import { wakeEventSchema } from '../record/wake-event-schema';
import { wakeEvents } from '../start/wake-events';
import type { CodingAdapter, CodingContext } from '../types';
import { readToolBinding } from './read-tool-binding';

const inputSchema = z.strictObject({ task: z.string(), wake: z.array(wakeEventSchema) });

// coding.watch: replaces the wake set of a coding task. The coding source reads the new set from the
// next event on.
export function buildCodingWatchTool(
  context: CodingContext,
  adapter: CodingAdapter,
): ToolDefinition {
  return {
    name: codingToolNames.watch,
    description: 'Chooses which events of a coding task wake you. Pass the whole set you want.',
    input: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'the ID of a coding task with a session' },
        wake: {
          type: 'array',
          items: { type: 'string', enum: [...wakeEvents] },
          uniqueItems: true,
        },
      },
      required: ['task', 'wake'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { wake: { type: 'array', items: { type: 'string' } } },
      required: ['wake'],
      additionalProperties: false,
    },
    declaration: codingDeclarations.watch,
    execution: 'direct',
    run: async (call) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const found = await readToolBinding(context, adapter, parsed.data.task);

      if (found.status === 'refused') {
        return { status: 'error', message: found.sentence };
      }

      const wake = [...new Set(parsed.data.wake)];
      const tasks = context.tasks;

      await withWriteTransaction(tasks.log.writer, (tx) =>
        writeRecordsInTransaction(tx, tasks.log, [
          {
            kind: codingWakeSetCodec.kind,
            definitions: tasks.definitions(),
            thread: found.binding.taskID,
            payload: codingWakeSetCodec.encode({ taskID: found.binding.taskID, wake }),
          },
        ]),
      );

      return { status: 'ok', result: { wake } };
    },
  };
}
