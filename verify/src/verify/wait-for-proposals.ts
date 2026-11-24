import { WringerError } from '@wringer/core';
import { pickProposalRefusal } from './pick-proposal-refusal';
import { pickProposalWaitStep } from './pick-proposal-wait-step';

type ListedProposals = Parameters<typeof pickProposalRefusal>[0];

interface ProposalWait {
  readonly tool: string;
  readonly waiting: 'pending' | 'none';
  readonly waitMs?: number | undefined;
}

interface WaitClock {
  readonly nowMs: () => number;
  readonly sleep: (durationMs: number) => Promise<void>;
}

const monotonicClock: WaitClock = {
  nowMs: () => performance.now(),
  sleep: (durationMs) => Bun.sleep(durationMs),
};

// Lists the held calls until they match, and fails with `check-failed` when they do not in time.
// With no `waitMs` it reads once. With one, it never reads again at or after the deadline.
export async function waitForProposals<Listed extends { readonly proposals: ListedProposals }>(
  listProposals: () => Promise<Listed>,
  wait: ProposalWait,
  clock: WaitClock = monotonicClock,
): Promise<Listed> {
  const startedAtMs = clock.nowMs();

  for (;;) {
    const listed = await listProposals();

    const refusal = pickProposalRefusal(listed.proposals, wait);

    const step = pickProposalWaitStep({
      refusal,
      waitMs: wait.waitMs,
      startedAtMs,
      nowMs: clock.nowMs(),
    });

    if (step.kind === 'accept') {
      return listed;
    }

    if (step.kind === 'fail' || refusal === null) {
      throw new WringerError('check-failed', { message: refusal ?? '', data: listed });
    }

    await clock.sleep(step.sleepMs);

    const afterSleep = pickProposalWaitStep({
      refusal,
      waitMs: wait.waitMs,
      startedAtMs,
      nowMs: clock.nowMs(),
    });

    if (afterSleep.kind === 'fail') {
      throw new WringerError('check-failed', { message: refusal, data: listed });
    }
  }
}
