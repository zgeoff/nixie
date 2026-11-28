import type { RunEndpoint } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { WorkerDeps, WorkerPlan, WorkerRunNames } from './types';

export function startWorkerToolRun(
  deps: WorkerDeps,
  plan: WorkerPlan,
  names: WorkerRunNames,
): Promise<RunEndpoint> {
  const tools = deps.readTools();

  invariant(tools, 'the tool endpoint is not running');

  return tools.startRun({
    runID: names.workerRunID,
    thread: plan.caller.thread,
    logThread: plan.caller.logThread,
    tools: [...plan.tools],
    skills: plan.skills,
    model: { model: names.model, profile: names.profile },
    ...(plan.caller.taskRun === undefined ? {} : { taskRun: plan.caller.taskRun }),
    ...(plan.caller.connectionPins === undefined
      ? {}
      : { connectionPins: plan.caller.connectionPins }),
    toolUseMetaKey: plan.target.harness.toolUseMetaKey,
    parent: plan.caller.callSequence,
  });
}
