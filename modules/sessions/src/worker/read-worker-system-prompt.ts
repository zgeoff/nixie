import type { WorkerDeps, WorkerPlan } from './types';
import { workerSystemPrompt } from './worker-system-prompt';

// The worker's instructions, followed by the catalog of the skills the call gave it.
export async function readWorkerSystemPrompt(deps: WorkerDeps, plan: WorkerPlan): Promise<string> {
  if (plan.skills.length === 0 || deps.skills === undefined) {
    return workerSystemPrompt;
  }

  const catalog = await deps.skills.readCatalog({
    thread: plan.caller.thread,
    list: plan.skills,
    contextWindow: plan.target.harness.contextWindow,
  });

  return catalog === null ? workerSystemPrompt : `${workerSystemPrompt}\n\n${catalog}`;
}
