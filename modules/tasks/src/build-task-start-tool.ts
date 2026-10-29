import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { TaskMessaging, TasksContext } from './types';
import type { TaskStartRefusal } from './write-task-start';
import { writeTaskStart } from './write-task-start';

const startArguments = z.object({ name: z.string(), brief: z.string() });

export function buildTaskStartTool(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  messaging: Pick<TaskMessaging, 'ownerName'>,
): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';

  return {
    name: 'task.start',
    description:
      `Starts a new task for work that ${owner} asks for and that needs its own context, can ` +
      'wait, or lasts beyond this turn. Give it a short name, such as "Garden plan", and a brief ' +
      'that holds everything the task needs to do the work, because the task sees only its ' +
      'brief and the messages it receives. Check the task board first: when a task already ' +
      'covers the work, pass the message to it with task.message instead.',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        brief: { type: 'string', minLength: 1, maxLength: 8000 },
      },
      required: ['name', 'brief'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        taskID: { type: 'string' },
        name: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['taskID', 'name', 'note'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: ['name', 'brief'],
      results: { taskID: 'owner_data', name: 'owner_data', note: 'owner_data' },
    },
    execution: 'direct',
    run: async (call, tool): Promise<ToolOutcome> => {
      const input = startArguments.parse(call.input);

      const outcome = await writeTaskStart(context, {
        from: tool.run.thread,
        name: input.name,
        brief: input.brief,
        stepRunID: tool.run.stepRunID ?? null,
      });

      if (outcome.status === 'refused') {
        return { status: 'error', message: renderRefusal(outcome.refusal) };
      }

      const name = input.name.trim();

      return {
        status: 'ok',
        result: {
          taskID: outcome.taskID,
          name,
          note:
            `In your reply, tell ${owner} in a few words that you passed this to the ${name} ` +
            'task. No runner runs a started task in this release, so the task holds its ' +
            `messages unread: tell ${owner} it is queued.`,
        },
      };
    },
  };
}

function renderRefusal(refusal: TaskStartRefusal): string {
  return match(refusal)
    .with({ reason: 'empty_name' }, () => 'a task needs a name')
    .with({ reason: 'empty_brief' }, () => 'a task needs a brief')
    .with(
      { reason: 'stale_step' },
      () => 'this call comes from a step that no longer holds its task, so nixie started nothing',
    )
    .exhaustive();
}
