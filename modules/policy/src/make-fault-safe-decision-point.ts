import type { DecisionFault } from '@heynixie/log';
import type { DecisionPoint, PolicyCall, PolicyDecision, StageProgress } from './types';

export const decisionDeadlineMs = 30_000;

export interface FaultSafeOptions {
  readonly deadlineMs?: number;
}

// A decision point that throws, or runs past its deadline, denies the call at the stage it was
// running, so a fault never lets a call through.
export function makeFaultSafeDecisionPoint(
  decide: DecisionPoint,
  options: FaultSafeOptions = {},
): DecisionPoint {
  const deadlineMs = options.deadlineMs ?? decisionDeadlineMs;

  return async (call) => {
    const progress: StageProgress = { stage: 1 };
    const deadline = Promise.withResolvers<'timed_out'>();
    const timer = setTimeout(() => deadline.resolve('timed_out'), deadlineMs);

    try {
      return await Promise.race([
        decide(call, progress).catch((): 'threw' => 'threw'),
        deadline.promise,
      ]).then((outcome) =>
        typeof outcome === 'string' ? buildFaultDecision(call, progress, outcome) : outcome,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}

export const faultSentence = 'Not allowed: nixie could not decide on this call. Try again later.';

function buildFaultDecision(
  call: PolicyCall,
  progress: StageProgress,
  fault: DecisionFault,
): PolicyDecision {
  return {
    decision: {
      outcome: 'deny',
      stage: progress.stage,
      rule: null,
      destinations: call.destinations.map((destination) => ({
        value: destination.value,
        permission: null,
      })),
      snapshot: call.snapshot,
      fault,
    },
    sentence: faultSentence,
  };
}
