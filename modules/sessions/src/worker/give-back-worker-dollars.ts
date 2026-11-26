import type { WorkerPlan } from './types';

interface ReservingRun {
  readonly held: { reservedDollars: number };
  readonly chargedDollars: number;
  readonly tally: { readonly dollars: number };
}

// Every way out of a run that reserved dollars gives them back, and takes off what the run charged.
export async function giveBackWorkerDollars(plan: WorkerPlan, run: ReservingRun): Promise<void> {
  if (run.held.reservedDollars <= 0) {
    return;
  }

  const plannedDollars = run.held.reservedDollars;

  run.held.reservedDollars = 0;

  await plan.hold.onWorkerEnd?.({
    plannedDollars,
    chargedDollars: Math.max(run.chargedDollars, run.tally.dollars),
  });
}
