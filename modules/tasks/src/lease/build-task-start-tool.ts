import type { JSONObject } from '@heynixie/log';
import type { ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { parseTaskStartInput } from '../runner/parse-task-start-input';
import { pickStartRunner } from '../runner/pick-start-runner';
import type { StartableRunner } from '../runner/types';
import { readTaskSetup } from '../task/read-task-setup';
import type { TaskStartRefusal } from '../task/start/write-task-start';
import { writeTaskStart } from '../task/start/write-task-start';
import type {
  TaskMemory,
  TaskMessaging,
  TaskPersona,
  TaskReport,
  TaskStartBounds,
  TasksContext,
} from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';

type StartToolContext = Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'runners'>;

export function buildTaskStartTool(
  context: StartToolContext,
  messaging: Pick<TaskMessaging, 'hopLimit' | 'ownerName'>,
  bounds: TaskStartBounds,
): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';
  const registry = context.runners;
  const startable = registry.startable;
  const defaultStart = startable.find((runner) => runner.key === registry.defaultRunner.key)?.start;

  invariant(defaultStart, 'the task.start tool needs the default runner to have a start');

  const inputs = startable.map((runner) => runner.start.describeInput(bounds));

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
      'which must be tools you hold yourself. A memory read tool also needs memory set to read.',
    input:
      inputs.length === 1 && inputs[0] !== undefined
        ? inputs[0]
        : { type: 'object', oneOf: inputs },
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
    declaration: defaultStart.declaration,
    variants: {
      pick: (input) => pickStartRunner(input, registry).key,
      declarations: Object.fromEntries(
        startable.map((runner) => [runner.key, runner.start.declaration]),
      ),
    },
    execution: 'direct',
    resolvePolicyFacts: async (input, tool) => {
      const planned = await planStart(context, bounds, input, tool);

      return planned.status === 'refused'
        ? { status: 'error', message: planned.sentence }
        : { status: 'ok', sources: tool.run.session?.policy?.sources ?? [], args: input };
    },
    run: async (call, tool): Promise<ToolOutcome> => {
      const planned = await planStart(context, bounds, call.input, tool);

      if (planned.status === 'refused') {
        return { status: 'error', message: planned.sentence };
      }

      const runner = planned.runner;
      const plan = planned.plan;
      const envelope = parseTaskStartInput(call.input, registry);

      const outcome = await writeTaskStart(context, {
        from: tool.run.thread,
        name: envelope.name,
        brief: envelope.brief,
        runner: runner.key,
        stored: runner.start.storesBuiltOptions
          ? { kind: 'built', options: plan.options }
          : { kind: 'enveloped', envelope: plan.envelope, runnerOptions: plan.options },
        hopLimit: messaging.hopLimit,
        stepRunID: tool.run.stepRunID ?? null,
      });

      if (outcome.status === 'refused') {
        return { status: 'error', message: renderRefusal(outcome.refusal) };
      }

      const name = envelope.name.trim();

      return {
        status: 'ok',
        result: {
          taskID: outcome.taskID,
          name,
          note: `The task starts on its brief now, and ${renderReportNote(plan.envelope.report)}`,
        },
      };
    },
  };
}

type PlannedStart =
  | {
      readonly status: 'planned';
      readonly runner: StartableRunner;
      readonly plan: Extract<
        ReturnType<StartableRunner['start']['plan']>,
        { readonly status: 'planned' }
      >;
    }
  | { readonly status: 'refused'; readonly sentence: string };

// The runner that the input picks plans the start for its starter, so a refusal reaches the model
// before the decision point and an approval never queues a start that nixie then refuses.
async function planStart(
  context: StartToolContext,
  bounds: TaskStartBounds,
  input: JSONObject,
  tool: ToolContext,
): Promise<PlannedStart> {
  const runner = pickStartRunner(input, context.runners);

  const access = await readStarterAccess(context, tool.run.thread);

  const plan = runner.start.plan(input, { tools: tool.run.tools, ...access }, bounds);

  return plan.status === 'refused' ? plan : { status: 'planned', runner, plan };
}

// The conversation reads memory. Any other starter reads it only when its own start said so.
interface StarterAccess {
  readonly memory: TaskMemory;
  readonly persona: TaskPersona;
}

// The conversation has the persona and reads memory. Any other starter has each only when its own
// start gave it, and a task that the user started holds no options, so it has neither.
async function readStarterAccess(
  context: Pick<TasksContext, 'log' | 'runners'>,
  thread: string,
): Promise<StarterAccess> {
  if (thread === conversationTaskID) {
    return { memory: 'read', persona: 'default' };
  }

  const setup = await readTaskSetup(context, thread);

  const options = setup?.kind === 'started' ? setup.options : null;

  return { memory: options?.memory ?? 'none', persona: options?.persona ?? 'none' };
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
