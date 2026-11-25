import type { JSONObject } from '@heynixie/log';
import type {
  RelatedMemoryLookup,
  ToolDefinition,
  ToolOutcome,
  ToolResolveContext,
} from '@heynixie/tools';
import { addRelatedMemory, relatedMemoryOutput } from '@heynixie/tools';
import type { HarnessID } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { oneOfStartHarnesses } from '../runner/one-of-start-harnesses';
import { parseTaskStartInput } from '../runner/parse-task-start-input';
import { pickStartRunner } from '../runner/pick-start-runner';
import type { StartDeclaration, StartableRunner } from '../runner/types';
import { readTaskSetup } from '../task/read-task-setup';
import type { TaskStartRefusal } from '../task/start/write-task-start';
import { writeTaskStart } from '../task/start/write-task-start';
import type {
  TaskLog,
  TaskMemory,
  TaskMessaging,
  TaskPersona,
  TaskReport,
  TaskStartBounds,
  TasksContext,
} from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';

type StartToolContext = Pick<TasksContext, 'clock' | 'definitions' | 'log' | 'runners'>;

interface StartMessaging extends Pick<TaskMessaging, 'hopLimit' | 'ownerName'> {
  // the harnesses of the model profiles in use. The variants past the default runner's are left out
  // unless every one of them is in `oneOfStartHarnesses`; absent, none is left out.
  readonly harnesses?: readonly HarnessID[];
}

export function buildTaskStartTool(
  context: StartToolContext,
  messaging: StartMessaging,
  bounds: TaskStartBounds,

  // what task.start looks up in memory after it applies, for a starter that reads memory; without
  // it, the result carries no `related`
  relatedMemory?: RelatedMemoryLookup,
): ToolDefinition {
  const owner = messaging.ownerName ?? 'the owner';
  const registry = context.runners;

  const startable = pickAdvertisedStarts(
    registry.startable,
    registry.defaultRunner.key,
    messaging.harnesses,
  );

  const defaultStart = startable.find((runner) => runner.key === registry.defaultRunner.key)?.start;

  invariant(defaultStart, 'the task.start tool needs the default runner to have a start');

  const inputs = startable.map((runner) => runner.start.describeInput(bounds));

  return {
    name: 'task.start',
    description:
      'Starts a new task for work that needs its own context, can wait, or lasts beyond this ' +
      `turn, whether ${owner} asked for it or you saw it needed doing. ` +
      'Give it a short name, such as "Garden plan", and a brief ' +
      'that holds everything the task needs to do the work, because the task sees only its ' +
      'brief and the messages it receives. When a task may already cover the work, check ' +
      'tasks.list, and pass the work to that task with task.message instead. The task speaks as you ' +
      'unless you set persona to none, and reads your memory only when you set memory to read. ' +
      'It always holds tasks.list and task.message, and time.now unless you list its tools, ' +
      'which must be tools you hold yourself. A memory read tool also needs memory set to read. ' +
      "Set log to conversation to let the task read the conversation's log.",
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
        related: relatedMemoryOutput,
      },
      required: ['taskID', 'name', 'note'],
      additionalProperties: false,
    },
    declaration: addRelatedResult(defaultStart.declaration),
    variants: {
      pick: (input) => pickStartRunner(input, registry).key,
      declarations: Object.fromEntries(
        startable.map((runner) => [runner.key, addRelatedResult(runner.start.declaration)]),
      ),
    },
    execution: 'direct',
    resolvePolicyFacts: async (input, tool) => {
      const planned = await planStart(context, bounds, input, tool);

      return planned.status === 'refused'
        ? { status: 'error', message: planned.sentence }
        : {
            status: 'ok',
            sources: tool.run.session?.policy?.sources ?? [],
            args: input,
          };
    },
    run: async (call, tool): Promise<ToolOutcome> => {
      const planned = await planStart(context, bounds, call.input, tool);

      if (planned.status === 'refused') {
        return { status: 'error', message: planned.sentence };
      }

      const runner = planned.runner;
      const plan = planned.plan;
      const envelope = parseTaskStartInput(call.input, registry);
      const disposable = envelope.disposable ?? true;

      const outcome = await writeTaskStart(context, {
        from: tool.run.thread,
        name: envelope.name,
        brief: envelope.brief,
        runner: runner.key,
        stored: runner.start.storesBuiltOptions
          ? { kind: 'built', options: plan.options }
          : {
              kind: 'enveloped',
              envelope: plan.envelope,
              runnerOptions: plan.options,
            },
        hopLimit: messaging.hopLimit,
        stepRunID: tool.run.stepRunID ?? null,
        disposable,

        // the plan runs before the call has an ID, so its actions name the call with an empty ID
        actions: plan.actions.map((action) =>
          action.causedBy.kind === 'tool_call'
            ? { ...action, causedBy: { kind: 'tool_call' as const, callID: call.callID } }
            : action,
        ),
        transaction: plan.transaction,
      });

      if (outcome.status === 'refused') {
        return { status: 'error', message: renderRefusal(outcome.refusal) };
      }

      const name = envelope.name.trim();

      const started: ToolOutcome = {
        status: 'ok',
        result: {
          taskID: outcome.taskID,
          name,
          note: `The task starts on its brief now, and ${renderReportNote(plan.envelope.report, disposable)}`,
        },
      };

      // A task that holds no memory never reads what the starter's memory holds.
      const lookup = planned.memory === 'none' ? undefined : relatedMemory;

      return addRelatedMemory(started, lookup, {
        callID: call.callID,
        text: `${envelope.name}\n${envelope.brief}`,
      });
    },
  };
}

function pickAdvertisedStarts(
  startable: readonly StartableRunner[],
  defaultKey: string,
  harnesses: readonly HarnessID[] | undefined,
): readonly StartableRunner[] {
  const isOneOfSafe =
    harnesses === undefined ||
    harnesses.every((harness) => oneOfStartHarnesses.some((passed) => passed === harness));

  return isOneOfSafe ? startable : startable.filter((runner) => runner.key === defaultKey);
}

// Memory text can hold outside content, so a runner's declaration gains a source for `related`.
function addRelatedResult(declaration: StartDeclaration): StartDeclaration {
  return { ...declaration, results: { ...declaration.results, related: 'untrusted' } };
}

type PlannedStart =
  | {
      readonly status: 'planned';
      readonly runner: StartableRunner;
      readonly memory: TaskMemory;
      readonly plan: Extract<
        Awaited<ReturnType<StartableRunner['start']['plan']>>,
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
  tool: ToolResolveContext,
): Promise<PlannedStart> {
  const runner = pickStartRunner(input, context.runners);

  const access = await readStarterAccess(context, tool.run.thread);
  const plan = await runner.start.plan(input, { tools: tool.run.tools, ...access }, bounds);

  return plan.status === 'refused'
    ? plan
    : { status: 'planned', runner, memory: access.memory, plan };
}

// The conversation reads memory. Any other starter reads it only when its own start said so.
interface StarterAccess {
  readonly memory: TaskMemory;
  readonly persona: TaskPersona;
  readonly log: TaskLog;
}

// The conversation has the persona and reads memory. Any other starter has each only when its own
// start gave it, and a task that the user started holds no options, so it has neither.
async function readStarterAccess(
  context: Pick<TasksContext, 'log' | 'runners'>,
  thread: string,
): Promise<StarterAccess> {
  if (thread === conversationTaskID) {
    return { memory: 'read', persona: 'default', log: 'conversation' };
  }

  const setup = await readTaskSetup(context, thread);

  const options = setup?.kind === 'started' ? setup.options : null;

  return {
    memory: options?.memory ?? 'none',
    persona: options?.persona ?? 'none',
    log: options?.log ?? 'own',
  };
}

function renderRefusal(refusal: TaskStartRefusal): string {
  return match(refusal)
    .with({ reason: 'empty_name' }, () => 'a task needs a name')
    .with({ reason: 'empty_brief' }, () => 'a task needs a brief')
    .with({ reason: 'runner_refused' }, (refused) => refused.sentence)
    .with(
      { reason: 'stale_step' },
      () => 'this call comes from a step that no longer holds its task, so nixie started nothing',
    )
    .exhaustive();
}

function renderReportNote(report: TaskReport, disposable: boolean): string {
  const delivery = match(report)
    .with('wake', () => 'its report comes back to you as a task message.')
    .with('next_turn', () => 'its report waits for your next turn as a task message.')
    .with('none', () => 'it sends you no report.')
    .exhaustive();

  return disposable
    ? `${delivery} The task closes when its work ends; start a task with disposable set to false to keep it open.`
    : delivery;
}
