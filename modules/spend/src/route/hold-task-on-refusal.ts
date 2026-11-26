import { readSpendFacts } from '../stop/read-spend-facts';
import { settleRouteStops } from '../stop/settle-route-stops';
import type { SpendContext } from '../types';
import { holdTaskOnRoute } from './hold-task-on-route';
import { isStepRefusal } from './is-step-refusal';

export interface RefusedStep {
  readonly taskID: string;
  readonly route: string;

  // the sandbox whose count holds the gateway's last refusal
  readonly sandboxName: string;

  // the instant the step began, so a refusal of an earlier step does not count
  readonly startedAtMs: number;
}

// A step failed on a route, which may be the gateway's refusal at the route's limit. It stops the
// route when the gateway's count shows it, holds the task, and answers whether the gateway refused
// the step, even when the limit has reset or risen since.
export async function holdTaskOnRefusal(
  context: SpendContext,
  step: RefusedStep,
): Promise<boolean> {
  const facts = await readSpendFacts(context);

  await settleRouteStops(context, facts);

  const isHeld = await holdTaskOnRoute(context, step.taskID, step.route);

  if (isHeld) {
    return true;
  }

  const read = await context.gateway.readSandbox(step.sandboxName);

  return read.kind === 'ok' && isStepRefusal(read.value, step.route, step.startedAtMs);
}
