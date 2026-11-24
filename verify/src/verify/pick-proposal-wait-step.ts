export type ProposalWaitStep =
  | { kind: 'accept' }
  | { kind: 'fail' }
  | { kind: 'sleep'; sleepMs: number };

const proposalPollMs = 200;

interface ProposalWaitInput {
  readonly refusal: string | null;
  readonly waitMs: number | undefined;
  readonly startedAtMs: number;
  readonly nowMs: number;
}

// Decides what to do after a read. A call to read with no `waitMs` is the only read, so it ends the
// wait whatever the clock says, and a sleep never runs past the deadline.
export function pickProposalWaitStep(input: ProposalWaitInput): ProposalWaitStep {
  if (input.refusal === null) {
    return { kind: 'accept' };
  }

  if (input.waitMs === undefined) {
    return { kind: 'fail' };
  }

  const remainingMs = input.startedAtMs + input.waitMs - input.nowMs;

  if (remainingMs <= 0) {
    return { kind: 'fail' };
  }

  return { kind: 'sleep', sleepMs: Math.min(proposalPollMs, remainingMs) };
}
