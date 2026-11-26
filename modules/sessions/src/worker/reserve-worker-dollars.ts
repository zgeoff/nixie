import type { WorkerPlan } from './types';

export interface ReservedWorkerPlan {
  // the plan, with the dollars the task's sandbox gave up when they fell short of the plan's
  readonly plan: WorkerPlan;
  readonly reservedDollars: number;
}

// The calling task's sandbox gives the run's dollars up before the run starts, so the task and its
// worker never spend the same dollars. The run gets what the sandbox has left when it asks, which
// can be less than it planned. Null when the sandbox gave none.
export async function reserveWorkerDollars(plan: WorkerPlan): Promise<ReservedWorkerPlan | null> {
  if (plan.hold.onWorkerStart === undefined) {
    return { plan, reservedDollars: 0 };
  }

  const granted = await plan.hold.onWorkerStart(plan.limits.dollars);

  if (granted <= 0) {
    return null;
  }

  if (granted >= plan.limits.dollars) {
    return { plan, reservedDollars: granted };
  }

  return {
    plan: { ...plan, limits: { ...plan.limits, dollars: granted }, isTaskLimit: true },
    reservedDollars: granted,
  };
}
