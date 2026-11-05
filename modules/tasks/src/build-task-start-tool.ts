import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { conversationTaskID } from './conversation-task-id';
import type { TaskStartChoiceRefusal } from './plan-task-start';
import { planTaskStart } from './plan-task-start';
import { readTaskSetup } from './read-task-setup';
import type {
  TaskMemory,
  TaskMessaging,
  TaskPersona,
  TaskReport,
  TaskStartBounds,
  TasksContext,
} from './types';
import type { TaskStartRefusal } from './write-task-start';
import { writeTaskStart } from './write-task-start';

const startArguments = z.object({
  name: z.string(),
  brief: z.string(),
  model: z.string().optional(),
  persona: z.enum(['default', 'none']).optional(),
  memory: z.enum(['none', 'read']).optional(),
  tools: z.string().array().optional(),
  report: z.enum(['wake', 'next_turn', 'none']).optional(),
  limits: z
    .object({ turns: z.int().positive().optional(), dollars: z.number().positive().optional() })
    .optional(),
});

export function buildTaskStartTool(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  messaging: Pick<TaskMessaging, 'ownerName'>,
  bounds: TaskStartBounds,
): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';

  return {
    name: 'task.start',
    description:
      `Starts a new task for work that ${owner} asks for and that needs its own context, can ` +
      'wait, or lasts beyond this turn. Give it a short name, such as "Garden plan", and a brief ' +
      'that holds everything the task needs to do the work, because the task sees only its ' +
      'brief and the messages it receives. When a task may already cover the work, check ' +
      'tasks.list, and pass the work to that task with task.message instead. The task speaks as you ' +
      'unless you set persona to none, and reads your memory only when you set memory to read. ' +
      'It always holds tasks.list and task.message, and time.now unless you list its tools, ' +
      'which must be tools you hold yourself.',
    input: buildStartInput(bounds),
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

      const access = await readStarterAccess(context, tool.run.thread);

      const plan = planTaskStart(input, { tools: tool.run.tools, ...access }, bounds);

      if (plan.status === 'refused') {
        return { status: 'error', message: renderChoiceRefusal(plan.refusal) };
      }

      const outcome = await writeTaskStart(context, {
        from: tool.run.thread,
        name: input.name,
        brief: input.brief,
        options: plan.options,
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
          note: `The task starts on its brief now, and ${renderReportNote(plan.options.report)}`,
        },
      };
    },
  };
}

function buildStartInput(bounds: TaskStartBounds): JSONObject {
  const limits = bounds.limits;
  const choices = bounds.models.map((entry) => `${entry.name}: ${entry.description}`).join('; ');

  const model: JSONObject | null =
    bounds.models.length === 0
      ? null
      : {
          type: 'string',
          enum: bounds.models.map((entry) => entry.name),
          description: `The model the task runs on; leave it out for the usual one. ${choices}`,
        };

  return {
    type: 'object',
    properties: {
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
      tools: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
        maxItems: 50,
        description: 'the names of tools you hold that the task may use',
      },
      report: {
        type: 'string',
        enum: ['wake', 'next_turn', 'none'],
        description:
          'how the result reaches you: wake wakes you, next_turn waits for your next turn, ' +
          'none sends no report',
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

// The conversation reads memory. Any other starter reads it only when its own start said so.
interface StarterAccess {
  readonly memory: TaskMemory;
  readonly persona: TaskPersona;
}

// The conversation has the persona and reads memory. Any other starter has each only when its own
// start gave it, and a task that the user started holds no options, so it has neither.
async function readStarterAccess(
  context: Pick<TasksContext, 'log'>,
  thread: string,
): Promise<StarterAccess> {
  if (thread === conversationTaskID) {
    return { memory: 'read', persona: 'default' };
  }

  const setup = await readTaskSetup(context, thread);

  return { memory: setup?.options?.memory ?? 'none', persona: setup?.options?.persona ?? 'none' };
}

function renderChoiceRefusal(refusal: TaskStartChoiceRefusal): string {
  return match(refusal)
    .with(
      { reason: 'unknown_model' },
      (unknown) => `${unknown.model} is not a model a task can run on, so nixie started nothing`,
    )
    .with(
      { reason: 'stranger_with_memory' },
      () => 'a task with persona none cannot read memory, so nixie started nothing',
    )
    .with(
      { reason: 'wider_memory' },
      () => 'you do not read memory, so a task you start cannot either, and nixie started nothing',
    )
    .with(
      { reason: 'wider_persona' },
      () =>
        'you run with no persona, so a task you start cannot have one, and nixie started nothing',
    )
    .with(
      { reason: 'over_limit' },
      (over) =>
        `a task's ${over.limit} limit is at most ${String(over.max)}, so nixie started nothing`,
    )
    .with(
      { reason: 'wider_tools' },
      (wider) =>
        `a task gets only tools you hold, and you do not hold ${wider.tools.join(', ')}, so nixie started nothing`,
    )
    .with(
      { reason: 'memory_tools' },
      (memory) =>
        `the task's memory setting leaves out ${memory.tools.join(', ')}, so nixie started nothing`,
    )
    .with(
      { reason: 'conversation_tools' },
      (conversation) =>
        `only the conversation can use ${conversation.tools.join(', ')}, so nixie started nothing`,
    )
    .exhaustive();
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

function renderReportNote(report: TaskReport): string {
  return match(report)
    .with('wake', () => 'its report comes back to you as a task message.')
    .with('next_turn', () => 'its report waits for your next turn as a task message.')
    .with('none', () => 'it sends you no report.')
    .exhaustive();
}
