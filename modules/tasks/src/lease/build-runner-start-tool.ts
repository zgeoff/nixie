import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition, ToolOutcome, ToolResolveContext } from '@heynixie/tools';
import { addRelatedMemory, relatedMemoryOutput } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { StartDeclaration, StartableRunner } from '../runner/types';
import { readTaskSetup } from '../task/read-task-setup';
import type { TaskStartRefusal } from '../task/start/write-task-start';
import { writeTaskStart } from '../task/start/write-task-start';
import type {
  TaskLog,
  TaskMemory,
  TaskPersona,
  TaskReport,
  TaskStartBounds,
  TasksContext,
} from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import type { RunnerStartSpec, StartMessaging, StartToolContext } from './types';

// The tool that starts one runner's task, such as `coding.start`. It takes the runner's own input
// and nothing of the sandbox task's, and a rule matches it by its own name.
export function buildRunnerStartTool(
  context: StartToolContext,
  messaging: StartMessaging,
  bounds: TaskStartBounds,
  spec: RunnerStartSpec,
): ToolDefinition {
  const runner = context.runners.startable.find((candidate) => candidate.key === spec.runner);

  invariant(runner, `the ${spec.name} tool needs the runner ${spec.runner} to have a start`);

  return {
    name: spec.name,
    description: spec.description,
    input: runner.start.describeInput(bounds),
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
    declaration: addRelatedResult(runner.start.declaration),
    execution: 'direct',
    resolvePolicyFacts: async (input, tool) => {
      const planned = await planStart(context, { runner, bounds }, input, tool);

      return planned.status === 'refused'
        ? { status: 'error', message: planned.sentence }
        : {
            status: 'ok',
            sources: tool.run.session?.policy?.sources ?? [],
            args: input,
          };
    },
    run: async (call, tool): Promise<ToolOutcome> => {
      const planned = await planStart(context, { runner, bounds }, call.input, tool);

      if (planned.status === 'refused') {
        return { status: 'error', message: planned.sentence };
      }

      const plan = planned.plan;
      const envelope = runner.start.schema.parse(call.input);
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
      const lookup = planned.memory === 'none' ? undefined : spec.relatedMemory;

      return addRelatedMemory(started, lookup, {
        callID: call.callID,
        text: `${envelope.name}\n${envelope.brief}`,
      });
    },
  };
}

// Memory text can hold outside content, so a runner's declaration gains a source for `related`.
function addRelatedResult(declaration: StartDeclaration): StartDeclaration {
  return { ...declaration, results: { ...declaration.results, related: 'untrusted' } };
}

interface StartPlanner {
  readonly runner: StartableRunner;
  readonly bounds: TaskStartBounds;
}

type PlannedStart =
  | {
      readonly status: 'planned';
      readonly memory: TaskMemory;
      readonly plan: Extract<
        Awaited<ReturnType<StartableRunner['start']['plan']>>,
        { readonly status: 'planned' }
      >;
    }
  | { readonly status: 'refused'; readonly sentence: string };

// The runner plans the start for its starter, so a refusal reaches the model before the decision
// point and an approval never queues a start that nixie then refuses.
async function planStart(
  context: StartToolContext,
  start: StartPlanner,
  input: JSONObject,
  tool: ToolResolveContext,
): Promise<PlannedStart> {
  const access = await readStarterAccess(context, tool.run.thread);

  const plan = await start.runner.start.plan(
    input,
    {
      tools: tool.run.tools,
      ...access,
      ...(tool.run.connectionPins === undefined ? {} : { connectionPins: tool.run.connectionPins }),
    },
    start.bounds,
  );

  return plan.status === 'refused' ? plan : { status: 'planned', memory: access.memory, plan };
}

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
