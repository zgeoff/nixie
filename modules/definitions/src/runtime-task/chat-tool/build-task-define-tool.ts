import { parseJSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { buildOffsetAt } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readDefinitionNotices } from '../read-definition-notices';
import { requestDefinitionChange } from '../request-definition-change';
import type { ChatToolOptions } from './chat-tool-options';
import { notReadyMessage } from './chat-tool-options';
import { taskDefineInputSchema } from './task-define-input-schema';

const jsonSchema = z.toJSONSchema(taskDefineInputSchema, {
  io: 'input',
  target: 'draft-2020-12',
});

const inputSchema = z.record(z.string(), z.json()).parse(structuredClone(jsonSchema));

// Held by the conversation alone: the tool stays out of every task's list.
export function buildTaskDefineTool(options: ChatToolOptions): ToolDefinition {
  return {
    name: 'task.define',
    description:
      'Creates or replaces a task definition from a name, a brief and a trigger: a ' +
      "schedule, or one time with `at`. When the call needs the owner's approval, it waits as a " +
      'card, and you hear the result in your inbox; otherwise it takes effect at once, and the ' +
      'owner sees a notice with an undo. Pass definitionID to replace a definition, with every field you want kept: ' +
      'a field you leave out goes back to its default. An `at` without an offset is read in the ' +
      "owner's zone. A refusal comes back as `refused` with a code and what you need to retry.",
    input: inputSchema,
    output: {
      type: 'object',
      properties: {
        definitionID: { type: 'string' },
        rendered: { type: 'string', description: 'the trigger in words' },
        next: { type: ['string', 'null'], description: 'the date of the next fire' },
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
      results: {
        definitionID: 'owner_data',
        rendered: 'owner_data',
        next: 'owner_data',
        changeID: 'owner_data',
        refused: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = taskDefineInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const given = parsed.data;
      const context = options.readDefinitions();

      if (context === null) {
        return { status: 'error', message: notReadyMessage };
      }

      const { definitionID, trigger: givenTrigger, ...rest } = given;
      const ownerZone = 'at' in givenTrigger ? await options.readZone('owner') : null;

      const trigger =
        'at' in givenTrigger
          ? { at: buildOffsetAt(givenTrigger.at, ownerZone ?? 'UTC') }
          : givenTrigger;

      const result = await requestDefinitionChange(context, {
        kind: 'define',
        input: { ...rest, trigger, definitionID },
      });

      if (result.status === 'refused') {
        return {
          status: 'ok',
          result: { refused: parseJSONObject(JSON.stringify(result.refusal)) },
          refusalCode: result.refusal.code,
        };
      }

      const notices = await readDefinitionNotices(context.log.writer.db, [result.changeID], {
        now: context.log.writer.clock.now(),
        readZone: options.readZone,
      });

      const notice = notices.get(result.changeID);

      invariant(notice, 'a define writes a change that has a notice');

      const rendered = notice.rendered;

      invariant(rendered !== null, 'a define writes a change that holds a trigger');

      return {
        status: 'ok',
        result: {
          definitionID: result.definitionID,
          rendered,
          next: notice.next,
          changeID: result.shortID,
        },
      };
    },
  };
}
