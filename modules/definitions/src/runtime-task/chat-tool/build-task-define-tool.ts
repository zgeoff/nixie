import type { JSONObject } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { addRelatedMemory, relatedMemoryOutput } from '@heynixie/tools';
import { buildOffsetAt, checkSchedule } from '@heynixie/triggers';
import type { ScheduleFacts } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { taskMinGapMinutes } from '../../task/constants';
import { readDefinitionNotices } from '../read-definition-notices';
import { requestDefinitionChange } from '../request-definition-change';
import { buildConnectionPins } from './build-connection-pins';
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
      'schedule, or one time with `at`. A schedule is a `repeat` with a frequency, such as ' +
      '{"frequency":"weekly","byDay":["mon"],"at":["09:00"]}, and optional `hours` that limit ' +
      "when it fires, such as hourly from 09:00 to 17:00. When the call needs the owner's approval, it waits as a " +
      'card, and you hear the result in your inbox; otherwise it takes effect at once, and the ' +
      'owner sees a notice with an undo. When memory holds active items close to the definition, ' +
      '`related` lists them with their IDs and text: the call applies either way. Pass definitionID to replace a definition, with every field you want kept: ' +
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
        related: relatedMemoryOutput,
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
        related: 'untrusted',
      },
    },
    execution: 'direct',
    prepare: (input) => Promise.resolve(prepareDefine(input)),
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

      const { definitionID, trigger: givenTrigger, connections: named, ...rest } = given;

      const ownerZone = await options.readZone('owner');

      const checked = checkDefineTrigger(givenTrigger, {
        nowMs: context.log.writer.clock.now(),
        ownerZone,
        minGapMinutes: taskMinGapMinutes,
      });

      if (checked.status === 'refused') {
        return {
          status: 'ok',
          result: { refused: checked.refused },
          refusalCode: checked.refused.code,
        };
      }

      const trigger = checked.trigger;

      const usable = await options.connections?.readUsable();

      const pinned = buildConnectionPins({
        tools: rest.tools,
        named,
        usable: usable ?? [],
        connectorTools: options.connections?.connectorTools ?? [],
      });

      if (pinned.status === 'refused') {
        const refused = {
          code: 'connection_not_usable',
          path: 'connections',
          sentence: `You cannot use ${pinned.unusable.join(', ')}, so the task cannot be pinned to it.`,
        };

        return { status: 'ok', result: { refused }, refusalCode: refused.code };
      }

      const result = await requestDefinitionChange(context, {
        kind: 'define',
        input: {
          ...rest,
          trigger,
          definitionID,
          ...(Object.keys(pinned.pins).length === 0 ? {} : { connections: pinned.pins }),
        },
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

      return addRelatedMemory(
        {
          status: 'ok',
          result: {
            definitionID: result.definitionID,
            rendered,
            next: notice.next,
            changeID: result.shortID,
          },
        },
        options.relatedMemory,
        { callID: call.callID, text: `${given.name}\n${given.brief}` },
      );
    },
  };
}

// A define that sets `memory` to `self_notes` hands the task the self-note write tools, so the call
// adds `policy_widen` to the tool's effects: stage 4 then asks before it applies, and a deny rule on
// any effect of the tool still denies at stage 3.
function prepareDefine(input: JSONObject) {
  const parsed = taskDefineInputSchema.safeParse(input);

  return parsed.success && parsed.data.memory === 'self_notes'
    ? { destinations: [], effects: ['policy_widen'] as const }
    : { destinations: [] };
}

type TriggerInput = z.output<typeof taskDefineInputSchema>['trigger'];

// An `at` without an offset reads in the owner's zone, and a schedule goes through the schedule
// check, which refuses with the field and a fix.
function checkDefineTrigger(given: TriggerInput, facts: ScheduleFacts) {
  if ('at' in given) {
    return { status: 'ok', trigger: { at: buildOffsetAt(given.at, facts.ownerZone) } } as const;
  }

  const checked = checkSchedule(given.schedule, facts);

  return checked.status === 'ok'
    ? ({ status: 'ok', trigger: { schedule: checked.schedule } } as const)
    : ({
        status: 'refused',
        refused: {
          code: checked.code,
          path: `trigger.schedule.${checked.path}`,
          sentence: checked.sentence,
        },
      } as const);
}
