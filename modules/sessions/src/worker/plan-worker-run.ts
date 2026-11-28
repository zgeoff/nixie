import type { WorkerRunLimits } from '@heynixie/models';
import type { TaskStartBounds } from '@heynixie/tasks';
import { taskReportToolName } from '@heynixie/tasks';
import type { ToolRun } from '@heynixie/tools';
import { findToolPins, toSDKToolName } from '@heynixie/tools';
import { silentEndToolName } from '../turn/build-silent-end-tool';
import type { WorkerPlan, WorkerTargets } from './types';
import { workerRunToolName } from './worker-run-tool-name';

// The one skill tool a worker holds. A worker never reloads, because its thread is its caller's,
// and a reload there would move the caller's pin.
const workerSkillToolName = 'skill_read';

// A worker starts, messages, closes and lists no task, reports for none and starts no worker. The
// definitions list and the tools that change reminders belong to the conversation alone.
const neverHeldTools: ReadonlySet<string> = new Set([
  'task.start',
  'coding.start',
  'task.message',
  'task.close',
  'tasks.list',
  'tasks.definitions',
  'tasks.runs',
  'reminder.set',
  'reminder.update',
  'reminder.cancel',
  'reminder.snooze',
  'reminder.skip',
  taskReportToolName,
  silentEndToolName,
  workerRunToolName,
]);

export interface WorkerRunFacts {
  readonly call: {
    readonly callID: string;
    readonly callSequence: number;
    readonly question: string;

    // the tool names as the model wrote them
    readonly tools: readonly string[];

    // the skills the call names
    readonly skills: readonly string[];

    // the selectable model's name, when the call chose one
    readonly model?: string;
  };
  readonly run: ToolRun;

  // the skills the caller may use, which the call's skills stay within
  readonly callerSkills: readonly string[];

  // whether the worker tool still runs
  readonly isRunning: boolean;
  readonly bounds: Pick<TaskStartBounds, 'memoryTools' | 'conversationTools'>;
  readonly limits: WorkerRunLimits;
  readonly targets: WorkerTargets;
  readonly now: number;
}

export type WorkerRunPlan =
  | { readonly status: 'planned'; readonly plan: WorkerPlan }
  | { readonly status: 'refused'; readonly sentence: string };

// Every check before a worker runs, in the order the call meets them. A refusal is the call's error
// sentence and writes no worker record.
export function planWorkerRun(facts: WorkerRunFacts): WorkerRunPlan {
  const hold = facts.run.session?.step;
  const stepRunID = facts.run.stepRunID;

  if (hold === undefined || stepRunID === undefined) {
    return refuse('Only a model turn can run a worker.');
  }

  if (!facts.isRunning) {
    return refuse('The worker is not running, so nixie started none.');
  }

  const asked = [...new Set(facts.call.tools)];

  // The model sees each tool by its SDK name, so a call names a tool by that name as well.
  const tools = asked.map((name) => findHeldTool(name, facts.run.tools) ?? name);
  const lacked = tools.filter((tool) => !facts.run.tools.includes(tool));

  if (lacked.length > 0) {
    return refuse(
      `A worker gets only tools you hold, and you do not hold ${lacked.join(', ')}, so nixie started none.`,
    );
  }

  const skills = [...new Set(facts.call.skills)].toSorted();
  const unheldSkills = skills.filter((skill) => !facts.callerSkills.includes(skill));

  if (unheldSkills.length > 0) {
    return refuse(
      `A worker gets only skills you may use, and you may not use ${unheldSkills.join(', ')}, so nixie started none.`,
    );
  }

  if (skills.length > 0 && !facts.run.tools.includes(workerSkillToolName)) {
    return refuse(
      `A worker reads a skill with ${workerSkillToolName}, which you do not hold, so nixie started none.`,
    );
  }

  // The call may list skill_read itself, which a worker with skills holds in any case.
  const never = tools.filter(
    (tool) =>
      !(tool === workerSkillToolName && skills.length > 0) &&
      (neverHeldTools.has(tool) || facts.bounds.conversationTools.includes(tool)),
  );

  if (never.length > 0) {
    return refuse(`A worker can never use ${never.join(', ')}, so nixie started none.`);
  }

  const memory = tools.filter(
    (tool) =>
      facts.bounds.memoryTools.read.includes(tool) || facts.bounds.memoryTools.write.includes(tool),
  );

  if (memory.length > 0) {
    return refuse(`A worker cannot get ${memory.join(', ')}, so nixie started none.`);
  }

  const model = facts.call.model;
  const target = model === undefined ? facts.targets.role : facts.targets.byModel.get(model);

  if (target === undefined) {
    return refuse(renderUnknownModel(model ?? '', [...facts.targets.byModel.keys()]));
  }

  const left = hold.readLeftDollars();

  if (left !== null && left <= 0) {
    return refuse('This task has reached its dollar limit, so nixie started no worker.');
  }

  const taskDollars = left !== null && left < facts.limits.dollars ? left : null;

  return {
    status: 'planned',
    plan: {
      question: facts.call.question,
      target,
      tools: skills.length === 0 ? tools : [...new Set([...tools, workerSkillToolName])],
      skills,
      limits: { ...facts.limits, dollars: taskDollars ?? facts.limits.dollars },
      isTaskLimit: taskDollars !== null,
      calledAt: facts.now,
      hold,
      caller: {
        callID: facts.call.callID,
        callSequence: facts.call.callSequence,
        stepRunID,
        thread: facts.run.thread,
        logThread: facts.run.logThread,
        ...(facts.run.taskRun === undefined ? {} : { taskRun: facts.run.taskRun }),
        ...(facts.run.connectionPins === undefined
          ? {}
          : { connectionPins: pickWorkerPins(facts.run.connectionPins, tools) }),
      },
    },
  };
}

function refuse(sentence: string): WorkerRunPlan {
  return { status: 'refused', sentence };
}

function findHeldTool(name: string, held: readonly string[]): string | null {
  if (held.includes(name)) {
    return name;
  }

  return held.find((tool) => toSDKToolName(tool) === name) ?? null;
}

function renderUnknownModel(name: string, names: readonly string[]): string {
  return names.length === 0
    ? `This deployment offers no model choice, so there is no model ${name} to run a worker on, and nixie started none.`
    : `There is no model ${name} to run a worker on; choose one of ${names.join(', ')}, so nixie started none.`;
}

// A worker keeps the pins of each tool it holds, so delegation never reaches a connection that the
// caller could not.
function pickWorkerPins(
  pins: Readonly<Record<string, readonly string[]>>,
  tools: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    tools.flatMap((tool) => {
      const found = findToolPins(pins, tool);

      return found === undefined ? [] : [[tool, found] as const];
    }),
  );
}
