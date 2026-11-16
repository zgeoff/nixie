import type { WorkerRunLimits } from '@heynixie/models';
import type { TaskStartBounds } from '@heynixie/tasks';
import { taskReportToolName } from '@heynixie/tasks';
import type { ToolRun } from '@heynixie/tools';
import { toSDKToolName } from '@heynixie/tools';
import { silentEndToolName } from '../turn/build-silent-end-tool';
import type { WorkerPlan } from './types';
import { workerRunToolName } from './worker-run-tool-name';

// The tools that a worker never holds, whoever calls: a worker starts no task, sends no message,
// reports for no task, and starts no worker of its own.
const neverHeldTools: ReadonlySet<string> = new Set([
  'task.start',
  'task.message',
  'tasks.list',
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
  };
  readonly run: ToolRun;

  // whether the worker tool still runs
  readonly isRunning: boolean;
  readonly bounds: Pick<TaskStartBounds, 'memoryTools' | 'conversationTools'>;
  readonly limits: WorkerRunLimits;
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

  const never = tools.filter(
    (tool) => neverHeldTools.has(tool) || facts.bounds.conversationTools.includes(tool),
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

  const left = hold.readLeftDollars();

  if (left !== null && left <= 0) {
    return refuse('This task has reached its dollar limit, so nixie started no worker.');
  }

  const taskDollars = left !== null && left < facts.limits.dollars ? left : null;

  return {
    status: 'planned',
    plan: {
      question: facts.call.question,
      tools,
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
